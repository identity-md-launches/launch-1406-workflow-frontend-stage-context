import { useEffect, useId, useState } from 'react'
import { useAccount, usePublicClient, useReadContract } from 'wagmi'
import { erc20Abi, parseUnits, type Address } from 'viem'
import { TxStatus } from '../components/TxStatus'
import { permit2Abi, quoterAbi, settings, stateViewAbi, universalRouterAbi } from '../config'
import { useDeployment, useExplorer } from '../hooks/useDeployment'
import { useTokenPosition } from '../hooks/useDesk'
import { useEnsureChain } from '../hooks/useEnsureChain'
import { useTx } from '../hooks/useTx'
import { describeError } from '../lib/errors'
import { formatAmount } from '../lib/format'
import { applySlippage, encodeExecute, MAX_UINT48, planSwap, poolId, pricesFromSqrt } from '../lib/swap'

type Side = 'buy' | 'sell'

export function Trade() {
  const d = useDeployment()
  const explorer = useExplorer()
  const client = usePublicClient()
  const { address, isConnected } = useAccount()
  const { wrongChain, chainName } = useEnsureChain()
  const network = d.network
  const key = d.poolKey
  const uni = network?.uniswapV4
  const pair = network?.pairToken
  const snitchAddress = d.addresses.LaunchToken
  const [side, setSide] = useState<Side>('buy')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(String(settings.defaultSlippageBps / 100))
  const ids = { amount: useId(), slippage: useId() }

  const inputToken: Address | undefined = side === 'buy' ? pair?.address : snitchAddress
  const outputToken: Address | undefined = side === 'buy' ? snitchAddress : pair?.address
  const inputSymbol = side === 'buy' ? (pair?.symbol ?? 'IMD') : 'SNITCH'
  const outputSymbol = side === 'buy' ? 'SNITCH' : (pair?.symbol ?? 'IMD')
  const position = useTokenPosition(inputToken, uni?.permit2)
  const outPosition = useTokenPosition(outputToken, undefined)

  const permit2Allowance = useReadContract({
    abi: permit2Abi,
    address: uni?.permit2,
    functionName: 'allowance',
    args: address && inputToken && uni ? [address, inputToken, uni.universalRouter] : undefined,
    chainId: d.chainId,
    query: { enabled: isConnected && !wrongChain && !!address && !!inputToken && !!uni, refetchInterval: settings.pollIntervalMs },
  })
  const slot0 = useReadContract({
    abi: stateViewAbi,
    address: uni?.stateView,
    functionName: 'getSlot0',
    args: key ? [poolId(key)] : undefined,
    query: { enabled: !!uni && !!key, refetchInterval: settings.pollIntervalMs },
  })

  let amountIn: bigint | undefined
  try {
    amountIn = amount.trim() ? parseUnits(amount.trim(), 18) : undefined
  } catch {
    amountIn = undefined
  }
  const slippageBps = Math.round((Number(slippage) || 0) * 100)

  // Quote with the quoter's quoteExactInputSingle through eth_call (simulateContract), debounced.
  const [quote, setQuote] = useState<{ amountOut: bigint; forAmount: bigint; forSide: Side } | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoting, setQuoting] = useState(false)
  useEffect(() => {
    if (!client || !uni || !key || !inputToken || !amountIn || amountIn <= 0n) {
      setQuote(null)
      setQuoteError(null)
      setQuoting(false)
      return
    }
    const plan = planSwap(key, inputToken, amountIn, 0n)
    let cancelled = false
    setQuoting(true)
    const t = window.setTimeout(async () => {
      try {
        const { result } = await client.simulateContract({
          abi: quoterAbi,
          address: uni.quoter,
          functionName: 'quoteExactInputSingle',
          args: [{ poolKey: key, zeroForOne: plan.zeroForOne, exactAmount: amountIn, hookData: '0x' }],
        })
        if (cancelled) return
        setQuote({ amountOut: result[0], forAmount: amountIn, forSide: side })
        setQuoteError(null)
      } catch (e) {
        if (cancelled) return
        setQuote(null)
        setQuoteError(`No quote: ${describeError(e)}`)
      } finally {
        if (!cancelled) setQuoting(false)
      }
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [client, uni, key, inputToken, amountIn, side])

  const validQuote = quote && amountIn !== undefined && quote.forAmount === amountIn && quote.forSide === side ? quote : null
  const minOut = validQuote ? applySlippage(validQuote.amountOut, slippageBps) : undefined
  const balanceShort = amountIn !== undefined && position.balance !== undefined && position.balance < amountIn
  const needTokenApproval = amountIn !== undefined && position.allowance !== undefined ? position.allowance < amountIn : undefined
  const p2 = isConnected && !wrongChain && permit2Allowance.isSuccess && !permit2Allowance.isFetching ? permit2Allowance.data as readonly [bigint, number, number] : undefined
  const nowSec = Math.floor(Date.now() / 1000)
  const needPermit2 = amountIn !== undefined && p2 !== undefined ? (p2[0] < amountIn || p2[1] <= nowSec) : undefined
  const unknownAllowance = (error: unknown) => !isConnected ? 'Connect a wallet' : wrongChain ? 'Wrong network' : !amountIn ? 'Enter an amount' : error ? 'Allowance unavailable' : 'Checking allowance…'

  const approveToken = useTx(async () => {
    await position.refetch()
  })
  const approvePermit2 = useTx(async () => {
    await permit2Allowance.refetch()
  })
  const swap = useTx(async () => {
    await Promise.all([position.refetch(), outPosition.refetch(), permit2Allowance.refetch(), slot0.refetch()])
  })

  if (!network || !uni || !key) {
    return (
      <>
        <h1 className="h-page">Trade SNITCH</h1>
        <p className="empty">
          Swaps are disabled: this deployment has no vetted network block with Uniswap v4 addresses{!key ? ' or no pool key' : ''}. Reads still work.
        </p>
      </>
    )
  }

  // currency0 is SNITCH or the pair token depending on address order; express both ways.
  const snitchIs0 = key.currency0.toLowerCase() === snitchAddress.toLowerCase()
  const price = slot0.data ? pricesFromSqrt((slot0.data as readonly [bigint, number, number, number])[0], snitchIs0 ? 18 : pair!.decimals, snitchIs0 ? pair!.decimals : 18) : undefined
  const pairPerSnitch = snitchIs0 ? price?.currency1Per0 : price?.currency0Per1
  const snitchPerPair = snitchIs0 ? price?.currency0Per1 : price?.currency1Per0
  const [submitError, setSubmitError] = useState<string | null>(null)
  function blocker(): string | null {
    if (!amountIn || amountIn <= 0n) return `Enter the amount of ${inputSymbol} to pay.`
    if (needTokenApproval === undefined || needPermit2 === undefined) return 'Both allowances must be read successfully before swapping. Wait for the checks or retry them.'
    if (balanceShort) return `Not enough ${inputSymbol}: you hold ${formatAmount(position.balance)}.`
    if (!validQuote || minOut === undefined) return quoteError ?? 'Waiting for the quote. Try again in a moment.'
    if (needTokenApproval !== false) return `Approve ${inputSymbol} to Permit2 first (step 1).`
    if (needPermit2 !== false) return 'Allow the universal router through Permit2 first (step 2).'
    return null
  }

  return (
    <>
      <h1 className="h-page">Trade SNITCH</h1>
      <p className="lede">
        Buy and sell SNITCH against {pair?.symbol} in the launch pool on Uniswap v4. Quotes come from the network's quoter; the swap goes through its universal router.
      </p>
      <dl className="facts facts--tight">
        <dt>Pool price</dt>
        <dd className="mono">
          {pairPerSnitch ? `1 SNITCH = ${pairPerSnitch} ${pair?.symbol} · 1 ${pair?.symbol} = ${snitchPerPair} SNITCH` : slot0.error ? 'unavailable' : '…'}
        </dd>
        <dt>Pool</dt>
        <dd className="mono">
          fee {key.fee / 10_000}% · tick spacing {key.tickSpacing} ·{' '}
          <a href={explorer.address(key.hooks)} target="_blank" rel="noopener noreferrer">
            hook {key.hooks.slice(0, 10)}…
          </a>
        </dd>
        {isConnected && !wrongChain && (
          <>
            <dt>Your {inputSymbol}</dt>
            <dd className="mono">{formatAmount(position.balance)} {inputSymbol}</dd>
            <dt>Your {outputSymbol}</dt>
            <dd className="mono">{formatAmount(outPosition.balance)} {outputSymbol}</dd>
          </>
        )}
      </dl>
      <p className="hint">USD context is unavailable: this site reads no price feed.</p>

      <form
        className="form"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          setSubmitError(null)
          const why = blocker()
          if (why || !validQuote || minOut === undefined || !inputToken || amountIn === undefined) {
            setSubmitError(why ?? 'Unable to build the swap. Refresh the quote and try again.')
            return
          }
          const plan = planSwap(key, inputToken, amountIn, minOut)
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60)
          const { commands, inputs } = encodeExecute(key, plan, deadline, uni.extendedSwapParams === true)
          await swap.send({ abi: universalRouterAbi, address: uni.universalRouter, functionName: 'execute', args: [commands, inputs, deadline] })
        }}
      >
        <div className="segmented" role="group" aria-label="Direction">
          <button type="button" className="segmented__item" aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>
            Buy SNITCH with {pair?.symbol}
          </button>
          <button type="button" className="segmented__item" aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>
            Sell SNITCH for {pair?.symbol}
          </button>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor={ids.amount}>You pay ({inputSymbol})</label>
            <input id={ids.amount} name="amount" type="text" inputMode="decimal" autoComplete="off" className="mono" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={balanceShort} aria-describedby={`${ids.amount}-hint`} />
            <p id={`${ids.amount}-hint`} className={balanceShort ? 'error' : 'hint'}>
              {balanceShort ? `Not enough ${inputSymbol}: you hold ${formatAmount(position.balance)}.` : `Balance: ${isConnected && !wrongChain ? formatAmount(position.balance) : '—'} ${inputSymbol}`}
            </p>
          </div>
          <div className="field">
            <label htmlFor={ids.slippage}>Max slippage (%)</label>
            <input id={ids.slippage} name="slippage" type="text" inputMode="decimal" autoComplete="off" className="mono" value={slippage} onChange={(e) => setSlippage(e.target.value)} aria-describedby={`${ids.slippage}-hint`} />
            <p id={`${ids.slippage}-hint`} className="hint">
              The swap reverts if you would receive less than the quote minus this.
            </p>
          </div>
        </div>
        <dl className="facts facts--tight" aria-live="polite">
          <dt>You receive (quoted)</dt>
          <dd className="mono">{quoting ? 'Quoting…' : validQuote ? `${formatAmount(validQuote.amountOut)} ${outputSymbol}` : amountIn ? (quoteError ?? '…') : 'Enter an amount'}</dd>
          <dt>Minimum after slippage</dt>
          <dd className="mono">{minOut !== undefined ? `${formatAmount(minOut)} ${outputSymbol}` : '—'}</dd>
          {validQuote && amountIn && amountIn > 0n && (
            <>
              <dt>Effective rate</dt>
              <dd className="mono">
                1 {inputSymbol} = {formatAmount((validQuote.amountOut * 10n ** 18n) / amountIn, 18, 6)} {outputSymbol}
              </dd>
            </>
          )}
        </dl>

        <section className="stepper" aria-label="Steps">
          {!isConnected && <p className="hint">Connect a wallet (top of the page) to trade.</p>}
          {isConnected && wrongChain && <p className="hint">Switch the wallet to {chainName} (top of the page) to trade.</p>}
          {swap.walletStatus && <p className="hint" role="status">{swap.walletStatus}</p>}
          {(position.allowanceError || (isConnected && !wrongChain && permit2Allowance.error)) && <p className="error" role="alert">Unable to read allowances. <button type="button" className="btn btn--small" onClick={() => Promise.all([position.refetch(), permit2Allowance.refetch()])}>Retry allowance checks</button></p>}
          <div className="action">
            <h3 className="h-small">1. Approve {inputSymbol} to Permit2</h3>
            <button
              type="button"
              className="btn"
              disabled={!approveToken.ready || !amountIn || needTokenApproval !== true || approveToken.busy}
              onClick={() => inputToken && amountIn && approveToken.send({ abi: erc20Abi, address: inputToken, functionName: 'approve', args: [uni.permit2, amountIn] })}
            >
              {approveToken.busy ? 'Approving…' : needTokenApproval === undefined ? unknownAllowance(position.allowanceError) : needTokenApproval === false && amountIn ? `${inputSymbol} approved to Permit2` : `Approve ${inputSymbol} to Permit2`}
            </button>
            <TxStatus state={approveToken.state} doneText="Approved to Permit2." />
          </div>
          <div className="action">
            <h3 className="h-small">2. Let the router spend it through Permit2</h3>
            <button
              type="button"
              className="btn"
              disabled={!approvePermit2.ready || !amountIn || needTokenApproval !== false || needPermit2 !== true || approvePermit2.busy}
              onClick={() =>
                inputToken &&
                amountIn &&
                approvePermit2.send({
                  abi: permit2Abi,
                  address: uni.permit2,
                  functionName: 'approve',
                  args: [inputToken, uni.universalRouter, amountIn, Number(BigInt(nowSec + 30 * 24 * 3600) > MAX_UINT48 ? MAX_UINT48 : BigInt(nowSec + 30 * 24 * 3600))],
                })
              }
            >
              {approvePermit2.busy ? 'Approving…' : needPermit2 === undefined ? unknownAllowance(permit2Allowance.error) : needPermit2 === false && amountIn ? 'Router allowed' : 'Allow the universal router (30 days)'}
            </button>
            <TxStatus state={approvePermit2.state} doneText="The router may spend this amount for 30 days." />
          </div>
          <div className="action">
            <h3 className="h-small">3. Swap</h3>
            <p className="hint">The swap is simulated first; a revert reason shows here before the wallet opens.</p>
            <button type="submit" className="btn btn--primary" disabled={!swap.ready || (amountIn !== undefined && (needTokenApproval === undefined || needPermit2 === undefined)) || swap.busy}>
              {swap.busy ? 'Swapping…' : side === 'buy' ? 'Buy SNITCH' : 'Sell SNITCH'}
            </button>
            {submitError && (
              <p className="error" role="alert">
                {submitError}
              </p>
            )}
            <TxStatus state={swap.state} doneText="Swapped." />
          </div>
        </section>
      </form>
    </>
  )
}

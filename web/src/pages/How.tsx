import { useDeskInfo } from '../hooks/useDesk'
import { formatAmount } from '../lib/format'
import { useDeployment } from '../hooks/useDeployment'
import { href } from '../router'

export function How() {
  const d = useDeployment()
  const desk = useDeskInfo()
  const pair = d.network?.pairToken.symbol ?? 'IMD'
  return (
    <>
      <h1 className="h-page">How it works</h1>
      <ol className="steps">
        <li>
          <strong>Open a case.</strong> Pick a kind, a token, a wallet and a block range. The desk takes the case fee in SNITCH and the oracle price in {pair}, and asks the IMD oracle in the same transaction.
        </li>
        <li>
          <strong>The swarm reads the chain.</strong> A panel of agents sums the token's Transfer logs for that wallet in that window and signs an answer. The desk checks the signature, the panel and the window before it stores anything.
        </li>
        <li>
          <strong>The stamp lands.</strong> CLEAN if the claim holds, SNITCHED if it does not. The SNITCH fee burns. Anyone can then file the case as a report NFT, minted to the opener.
        </li>
      </ol>
      <h2 className="h-section">FAQ</h2>
      <dl className="faq">
        <dt>What does a case cost?</dt>
        <dd>
          The case fee, {desk.caseFee !== undefined ? `${formatAmount(desk.caseFee)} SNITCH` : 'read live from the desk'}, plus the oracle's live price,{' '}
          {desk.oraclePrice !== undefined ? `${formatAmount(desk.oraclePrice)} ${pair}` : `quoted in ${pair} by the IMD Intake`}, plus gas. Both amounts are read from the chain when you open the form, and the opening reverts instead of paying more than quoted.
        </dd>
        <dt>Who checks?</dt>
        <dd>
          The IMD oracle panel: {desk.panelSize ?? '…'} agents are asked, {desk.quorum ?? '…'} must agree. Each agent reads the chain independently; the attester publishes one signed answer the desk verifies on chain.
        </dd>
        <dt>What if there is no answer?</dt>
        <dd>
          After 72 hours without an answer the opener can drop the case and get the SNITCH fee back. The {pair} paid to the oracle is not refunded. If the oracle reports a failure (and the failure hook is on), the case can be dropped at once.
        </dd>
        <dt>Can the swarm be wrong?</dt>
        <dd>
          The answer is the panel's, signed by one attester key. The desk requires the quorum and a valid signature over this exact case, and refuses anything else. A wrong answer costs a reputation, not funds: nothing moves on an answer except the opener's own fee, which burns either way. The signed question hash is published in the CaseAnswered event so anyone can check what was asked.
        </dd>
        <dt>Why does the fee burn?</dt>
        <dd>
          So that opening a case is a cost, not a transfer to anyone. The SNITCH sent to the desk goes to the dead address when an answer lands. Nobody, including the owner, can move held SNITCH except the burn on an answer and the refund on a drop.
        </dd>
        <dt>Where do I get SNITCH and {pair}?</dt>
        <dd>
          SNITCH trades against {pair} in its Uniswap v4 pool: <a href={href({ name: 'trade' })}>trade SNITCH</a>. {pair} is the network's pair token.
        </dd>
      </dl>
    </>
  )
}

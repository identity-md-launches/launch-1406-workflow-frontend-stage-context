import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, InsufficientFundsError } from 'viem'

/** Human-readable messages for SnitchDesk custom errors and common wallet failures. */
const deskErrors: Record<string, string> = {
  BadKind: 'Choose a case kind: never sold or got in early.',
  TokenHasNoCode: 'The token address has no contract code on this chain. Check the address.',
  ZeroWallet: 'Enter the wallet the claim is about.',
  BadBlockRange: 'Use a from block lower than the to block, and a to block that is already mined.',
  FeeAboveLimit: 'The case fee changed while you were opening. Refresh the quote and try again.',
  PriceAboveLimit: 'The oracle price changed while you were opening. Refresh the quote and try again.',
  NotOpen: 'This case is no longer open.',
  NotAnswered: 'This case has no answer yet, so it cannot be filed.',
  NotTheOpener: 'Only the wallet that opened this case can drop it.',
  TooEarly: 'The 72-hour wait is not over yet. Come back when the countdown ends.',
  DuplicateRequestId: 'The intake returned a request id the desk has already seen. Try again.',
  FeeTooLarge: 'The fee must be at most 2^128 - 1.',
  BadPanel: 'Use 2 ≤ quorum ≤ size ≤ 100.',
  ZeroAddress: 'Enter a non-zero address.',
  RenounceDisabled: 'Ownership of the desk cannot be renounced.',
  OwnableUnauthorizedAccount: 'Only the owner can do this.',
  ERC20InsufficientAllowance: 'The approval is short. Approve the quoted amount first.',
  ERC20InsufficientBalance: 'The wallet does not hold enough of this token.',
}

export function describeError(error: unknown): string {
  if (!error) return 'Unknown error.'
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return 'Rejected in the wallet. Nothing was sent.'
    if (error.walk((e) => e instanceof InsufficientFundsError)) return 'Not enough ETH in the wallet to pay for gas.'
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null
    if (reverted) {
      const name = reverted.data?.errorName ?? reverted.reason
      if (name && deskErrors[name]) return deskErrors[name]
      if (name) return `The contract refused: ${name}.`
      return 'The contract refused the transaction. Check the inputs and try again.'
    }
    const short = error.shortMessage || error.message
    if (/user rejected|user denied/i.test(short)) return 'Rejected in the wallet. Nothing was sent.'
    if (/insufficient funds/i.test(short)) return 'Not enough ETH in the wallet to pay for gas.'
    return short
  }
  if (typeof error === 'object' && error && 'code' in error && (error as { code: unknown }).code === 4001) {
    return 'Rejected in the wallet. Nothing was sent.'
  }
  if (error instanceof Error) {
    if (/user rejected|user denied/i.test(error.message)) return 'Rejected in the wallet. Nothing was sent.'
    return error.message
  }
  return String(error)
}

import {describe,it,expect} from 'vitest';
import {MessageType, MESSAGE_ALLOCATION_ROOT_PARENT_INDEX, deriveInternalMessageCallKey} from 'genlayer-js';
import {finalizedMessageAllocation,type Address} from '../apps/web/src/lib/genlayer';

describe('finalized child message allocation',()=>{
  it('budgets record_finalized as a root internal message to the active EventRegistry',()=>{
    const recipient=('0x'+'1'.repeat(40)) as Address;
    const allocation=finalizedMessageAllocation({distribution:{leaderTimeunitsAllocation:100n,validatorTimeunitsAllocation:200n,appealRounds:0n,executionBudgetPerRound:25_000_000_000_000_000n,rotations:[0n],maxPriceGenPerTimeUnit:1n,storageFeeMaxGasPrice:250_000_000n,receiptFeeMaxGasPrice:250_000_000n}},recipient,30_000_000_000_000_000n);
    expect(allocation.messageType).toBe(MessageType.Internal);
    expect(allocation.onAcceptance).toBe(false);
    expect(allocation.parentIndex).toBe(MESSAGE_ALLOCATION_ROOT_PARENT_INDEX);
    expect(allocation.recipient).toBe(recipient);
    expect(allocation.callKey).toBe(deriveInternalMessageCallKey('record_finalized'));
    expect(allocation.budget).toBe(30_000_000_000_000_000n);
    expect(allocation.feeParams).toMatch(/^0x[0-9a-f]+$/);
  });
});

import { Transactions } from "@arkecosystem/crypto";
import ByteBuffer from "bytebuffer";
import { IBlockTimeAsset } from "../interfaces";

const { schemas } = Transactions;
const STAKE_UNDO_CANCEL_TYPE = 104;

export class StakeUndoCancelTransaction extends Transactions.Transaction {
    public static type = STAKE_UNDO_CANCEL_TYPE;
    public static getSchema(): Transactions.schemas.TransactionSchema {
        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "stakeUndoCancel",
            required: ["asset"],
            properties: {
                type: { transactionType: STAKE_UNDO_CANCEL_TYPE },
                amount: { bignumber: { minimum: 0, maximum: 0 } },
                asset: {
                    type: "object",
                    required: ["stakeUndoCancel"],
                    properties: {
                        stakeUndoCancel: {
                            type: "object",
                            required: ["blockTime"],
                            properties: {
                                duration: {
                                    type: "number",
                                    minimum: 1,
                                },
                            },
                        },
                    },
                },
            },
        });
    }

    public serialize(): ByteBuffer {
        const { data } = this;
        const stakeUndoCancel = data.asset.stakeUndoCancel as IBlockTimeAsset;

        // TODO: Verify that this works
        const buffer = new ByteBuffer(24, true);
        buffer.writeUint64(+stakeUndoCancel.blockTime);
        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;
        const stakeUndoCancel = {} as IBlockTimeAsset;

        stakeUndoCancel.blockTime = buf.readUint64().toInt();

        data.asset = {
            stakeUndoCancel,
        };
    }
}

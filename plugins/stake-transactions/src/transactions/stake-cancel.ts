import { Transactions } from "@arkecosystem/crypto";
import ByteBuffer from "bytebuffer";
import { IBlockTimeAsset } from "../interfaces";

const { schemas } = Transactions;
const STAKE_CANCEL_TYPE = 101;

export class StakeCancelTransaction extends Transactions.Transaction {
    public static type = STAKE_CANCEL_TYPE;
    public static getSchema(): Transactions.schemas.TransactionSchema {
        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "stakeCancel",
            required: ["asset"],
            properties: {
                type: { transactionType: STAKE_CANCEL_TYPE },
                amount: { bignumber: { minimum: 0, maximum: 0 } },
                asset: {
                    type: "object",
                    required: ["stakeCancel"],
                    properties: {
                        stakeCancel: {
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
        const stakeCancel = data.asset.stakeCancel as IBlockTimeAsset;

        // TODO: Verify that this works
        const buffer = new ByteBuffer(24, true);
        buffer.writeUint64(+stakeCancel.blockTime);
        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;
        const stakeCancel = {} as IBlockTimeAsset;
        stakeCancel.blockTime = buf.readUint64().toInt();
        data.asset = {
            stakeCancel,
        };
    }
}

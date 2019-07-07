import { Transactions } from "@arkecosystem/crypto";
import ByteBuffer from "bytebuffer";
import { IBlockTimeAsset } from "../interfaces";

const { schemas } = Transactions;
const STAKE_REDEEM_TYPE = 102;

export class StakeRedeemTransaction extends Transactions.Transaction {
    public static type = STAKE_REDEEM_TYPE;
    public static getSchema(): Transactions.schemas.TransactionSchema {
        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "stakeRedeem",
            required: ["asset"],
            properties: {
                type: { transactionType: STAKE_REDEEM_TYPE },
                amount: { bignumber: { minimum: 0, maximum: 0 } },
                asset: {
                    type: "object",
                    required: ["stakeRedeem"],
                    properties: {
                        stakeRedeem: {
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
        const stakeRedeem = data.asset.stakeRedeem as IBlockTimeAsset;

        // TODO: Verify that this works
        const buffer = new ByteBuffer(24, true);
        buffer.writeUint64(+stakeRedeem.blockTime);
        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;
        const stakeRedeem = {} as IBlockTimeAsset;

        stakeRedeem.blockTime = buf.readUint64().toInt();

        data.asset = {
            stakeRedeem,
        };
    }
}

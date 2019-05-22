import { Transactions } from "@arkecosystem/crypto";
import ByteBuffer from "bytebuffer";
import { IBlockTimeAsset } from "../interfaces";

const { schemas } = Transactions;
const STAKE_CLAIM_TYPE = 102;

export class StakeClaimTransaction extends Transactions.Transaction {
    public static type = STAKE_CLAIM_TYPE;
    public static getSchema(): Transactions.schemas.TransactionSchema {
        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "stakeClaim",
            required: ["asset"],
            properties: {
                type: { transactionType: STAKE_CLAIM_TYPE },
                amount: { bignumber: { minimum: 0, maximum: 0 } },
                asset: {
                    type: "object",
                    required: ["stakeClaim"],
                    properties: {
                        stakeClaim: {
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
        const stakeClaim = data.asset.stakeClaim as IBlockTimeAsset;

        // TODO: Verify that this works
        const buffer = new ByteBuffer(24, true);
        buffer.writeUint64(+stakeClaim.blockTime);
        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;
        const stakeClaim = {} as IBlockTimeAsset;

        stakeClaim.blockTime = buf.readUint64().toInt();

        data.asset = {
            stakeClaim,
        };
    }
}

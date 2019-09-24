import { Transactions } from "@nosplatform/crypto";
import ByteBuffer from "bytebuffer";
import { IStakeRedeemAsset } from "../interfaces";

const { schemas } = Transactions;
const STAKE_REDEEM_TYPE = 101;

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
                            required: ["txId"],
                            properties: {
                                txId: {
                                    type: "string",
                                    $ref: "hex",
                                    minLength: 64,
                                    maxLength: 64,
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
        const stakeRedeem = data.asset.stakeRedeem as IStakeRedeemAsset;

        // TODO: Verify that this works
        const buffer = new ByteBuffer(64, true);
        buffer.writeUint8(stakeRedeem.txId.length);
        buffer.append(stakeRedeem.txId, "hex");
        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;
        const stakeRedeem = {} as IStakeRedeemAsset;

        stakeRedeem.txId = buf.readBytes(64).toString("hex");

        data.asset = {
            stakeRedeem,
        };
    }
}

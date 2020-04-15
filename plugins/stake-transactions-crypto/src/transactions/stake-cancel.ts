import { Transactions, Utils } from "@arkecosystem/crypto";
import ByteBuffer from "bytebuffer";

import { StakeTransactionGroup, StakeTransactionType } from "../enums";
import { IStakeCancelAsset } from "../interfaces";

const { schemas } = Transactions;

export class StakeCancelTransaction extends Transactions.Transaction {
    public static typeGroup: number = StakeTransactionGroup;
    public static type: number = StakeTransactionType.StakeCancel;
    public static key: string = "stakeCancel";

    public static getSchema(): Transactions.schemas.TransactionSchema {
        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "stakeCancel",
            required: ["asset", "typeGroup"],
            properties: {
                type: { transactionType: StakeTransactionType.StakeCancel },
                typeGroup: { const: StakeTransactionGroup },
                amount: { bignumber: { minimum: 0, maximum: 0 } },
                asset: {
                    type: "object",
                    required: ["stakeCancel"],
                    properties: {
                        stakeCancel: {
                            type: "object",
                            required: ["id"],
                            properties: {
                                id: {
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

    protected static defaultStaticFee: Utils.BigNumber = Utils.BigNumber.ZERO;

    public serialize(): ByteBuffer {
        const { data } = this;
        const stakeCancel = data.asset.stakeCancel as IStakeCancelAsset;

        const txIdBytes = Buffer.from(stakeCancel.id, "utf8");
        const buffer = new ByteBuffer(txIdBytes.length + 1, true);

        buffer.writeUint8(txIdBytes.length);
        buffer.append(txIdBytes, "hex");

        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;
        const stakeCancel = {} as IStakeCancelAsset;

        const txIdLength = buf.readUint8();
        stakeCancel.id = buf.readString(txIdLength);

        data.asset = {
            stakeCancel,
        };
    }
}

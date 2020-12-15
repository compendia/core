import ByteBuffer from "bytebuffer";

import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";

import { StakeTransactionGroup, StakeTransactionType } from "../enums";
import { IStakeExtendAsset } from "../interfaces";

const { schemas } = Transactions;

export class StakeExtendTransaction extends Transactions.Transaction {
    public static typeGroup: number = StakeTransactionGroup;
    public static type: number = StakeTransactionType.StakeExtend;
    public static key: string = "stakeExtend";

    public static getSchema(): Transactions.schemas.TransactionSchema {
        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "stakeExtend",
            required: ["asset", "typeGroup"],
            properties: {
                type: { transactionType: StakeTransactionType.StakeExtend },
                typeGroup: { const: StakeTransactionGroup },
                amount: { bignumber: { minimum: 0, maximum: 0 } },
                fee: { bignumber: { minimum: 0, maximum: 0 } },
                recipientId: { $ref: "address" },
                asset: {
                    type: "object",
                    required: ["stakeExtend"],
                    properties: {
                        stakeExtend: {
                            type: "object",
                            required: ["id", "duration"],
                            properties: {
                                id: {
                                    type: "string",
                                    $ref: "hex",
                                    minLength: 64,
                                    maxLength: 64,
                                },
                                duration: {
                                    type: "integer",
                                    minimum: 0,
                                },
                            },
                        },
                    },
                },
            },
        });
    }

    protected static defaultStaticFee: Utils.BigNumber = Utils.BigNumber.make("100000000");

    public serialize(options?: Interfaces.ISerializeOptions): ByteBuffer {
        // @ts-ignore
        const { data } = this;

        const stakeExtend = data.asset.stakeExtend as IStakeExtendAsset;

        const txIdBytes = Buffer.from(stakeExtend.id, "utf8");
        const buffer = new ByteBuffer(txIdBytes.length + 1 + 8, true);

        buffer.writeUint8(txIdBytes.length);
        buffer.append(txIdBytes, "hex");

        buffer.writeUint64(+stakeExtend.duration);

        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        // @ts-ignore
        const { data } = this;
        const stakeExtend = {} as IStakeExtendAsset;

        const txIdLength = buf.readUint8();
        stakeExtend.id = buf.readString(txIdLength);
        stakeExtend.duration = buf.readUint64().toInt();

        data.asset = {
            stakeExtend,
        };
    }
}

import ByteBuffer from "bytebuffer";

import { Identities, Interfaces, Transactions, Utils } from "@arkecosystem/crypto";

import { StakeTransactionGroup, StakeTransactionType } from "../enums";
import { IStakeCreateAsset } from "../interfaces";

const { schemas } = Transactions;

export class StakeCreateTransaction extends Transactions.Transaction {
    public static typeGroup: number = StakeTransactionGroup;
    public static type: number = StakeTransactionType.StakeCreate;
    public static key: string = "stakeCreate";

    public static getSchema(): Transactions.schemas.TransactionSchema {
        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "stakeCreate",
            required: ["asset", "typeGroup"],
            properties: {
                type: { transactionType: StakeTransactionType.StakeCreate },
                typeGroup: { const: StakeTransactionGroup },
                amount: { bignumber: { minimum: 0, maximum: 0 } },
                fee: { bignumber: { minimum: 0, maximum: 0 } },
                recipientId: { $ref: "address" },
                asset: {
                    type: "object",
                    required: ["stakeCreate"],
                    properties: {
                        stakeCreate: {
                            type: "object",
                            required: ["duration", "amount", "timestamp"],
                            properties: {
                                duration: {
                                    type: "integer",
                                    minimum: 0,
                                },
                                amount: {
                                    bignumber: {
                                        minimum: 0,
                                    },
                                },
                                timestamp: {
                                    type: "integer",
                                },
                            },
                        },
                    },
                },
            },
        });
    }

    protected static defaultStaticFee: Utils.BigNumber = Utils.BigNumber.ZERO;

    public serialize(options?: Interfaces.ISerializeOptions): ByteBuffer {
        // @ts-ignore
        const { data } = this;

        let bufferLength = 8 + 8 + 8;
        // Append recipientId to buffer length if stake is transferable
        bufferLength = bufferLength + 21;

        const stakeCreate = data.asset.stakeCreate as IStakeCreateAsset;

        const buffer = new ByteBuffer(bufferLength, true);
        buffer.writeUint64(+stakeCreate.duration);
        buffer.writeUint64(+stakeCreate.amount);
        buffer.writeUint64(+stakeCreate.timestamp);

        if (!data.recipientId) {
            data.recipientId = Identities.Address.fromPublicKey(data.senderPublicKey);
        }
        const { addressBuffer, addressError } = Identities.Address.toBuffer(data.recipientId);
        options.addressError = addressError;
        buffer.append(addressBuffer);

        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        // @ts-ignore
        const { data } = this;
        const stakeCreate = {} as IStakeCreateAsset;

        stakeCreate.duration = buf.readUint64().toInt();
        stakeCreate.amount = Utils.BigNumber.make(buf.readUint64().toString());
        stakeCreate.timestamp = buf.readUint64().toInt();
        data.recipientId = Identities.Address.fromBuffer(buf.readBytes(21).toBuffer());

        data.asset = {
            stakeCreate,
        };
    }
}

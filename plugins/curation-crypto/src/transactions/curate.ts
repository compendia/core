import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";
import { base58 } from "bstring";
import ByteBuffer from "bytebuffer";

import { CuratorTransactionGroup, CuratorTransactionType } from "../enums";

const { schemas } = Transactions;

export class CurateTransaction extends Transactions.Transaction {
    public static typeGroup: number = CuratorTransactionGroup;
    public static type: number = CuratorTransactionType.Curate;
    public static key: string = "curate";

    public static getSchema(): Transactions.schemas.TransactionSchema {
        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "curate",
            required: ["asset", "typeGroup"],
            properties: {
                type: { transactionType: CuratorTransactionType.Curate },
                typeGroup: { const: CuratorTransactionGroup },
                amount: { bignumber: { minimum: 0, maximum: 0 } },
                fee: { bignumber: { minimum: 0, maximum: 0 } },
                asset: {
                    type: "object",
                    required: ["ipfs"],
                    properties: {
                        ipfs: {
                            allOf: [{ minLength: 2, maxLength: 90 }, { $ref: "base58" }],
                            // ipfs hash has varying length but we set max limit to twice the length of base58 ipfs sha-256 hash
                        },
                    },
                },
            },
        });
    }

    protected static defaultStaticFee: Utils.BigNumber = Utils.BigNumber.ZERO;

    public serialize(options?: Interfaces.ISerializeOptions): ByteBuffer {
        const { data } = this;

        const ipfsBuffer: Buffer = base58.decode(data.asset.ipfs);
        const buffer: ByteBuffer = new ByteBuffer(ipfsBuffer.length, true);

        buffer.append(ipfsBuffer, "hex");

        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;

        const hashFunction: number = buf.readUint8();
        const ipfsHashLength: number = buf.readUint8();
        const ipfsHash: Buffer = buf.readBytes(ipfsHashLength).toBuffer();

        const buffer: Buffer = Buffer.alloc(ipfsHashLength + 2);
        buffer.writeUInt8(hashFunction, 0);
        buffer.writeUInt8(ipfsHashLength, 1);
        buffer.fill(ipfsHash, 2);

        data.asset = {
            ipfs: base58.encode(buffer),
        };
    }
}

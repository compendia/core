import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";
import ByteBuffer from "bytebuffer";

import { FileTransactionGroup, FileTransactionType } from "../enums";
import { IIpfsAsset } from "../interfaces";

const { schemas } = Transactions;

export class SetFileTransaction extends Transactions.Transaction {
    public static typeGroup: number = FileTransactionGroup;
    public static type: number = FileTransactionType.SetFile;
    public static key: string = "setFile";

    public static getSchema(): Transactions.schemas.TransactionSchema {
        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "dpofIpfs",
            required: ["asset", "typeGroup"],
            properties: {
                type: { transactionType: FileTransactionType.SetFile },
                typeGroup: { const: FileTransactionGroup },
                amount: { bignumber: { minimum: 0, maximum: 0 } },
                fee: { bignumber: { minimum: 0 } },
                asset: {
                    type: "object",
                    required: ["fileKey", "ipfsHash"],
                    properties: {
                        fileKey: {
                            allOf: [{ type: "string", minimum: 6, maximum: 24, transform: ["toLowerCase"] }],
                        },
                        ipfsHash: {
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
        const ipfsAsset = data.asset as IIpfsAsset;
        const fileKey: Buffer = Buffer.from(ipfsAsset.fileKey, "utf8");
        const ipfsHash: Buffer = Buffer.from(ipfsAsset.ipfsHash, "utf8");

        const buffer: ByteBuffer = new ByteBuffer(fileKey.length + ipfsHash.length + 2, true);

        buffer.writeByte(fileKey.length);
        buffer.append(fileKey, "hex");

        buffer.writeByte(ipfsHash.length);
        buffer.append(ipfsHash, "hex");

        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;

        const fileKeyLength: number = buf.readUint8();
        const fileKey: string = buf.readString(fileKeyLength);

        const ipfsHashLength: number = buf.readUint8();
        const ipfsHash: string = buf.readString(ipfsHashLength);

        data.asset = {
            fileKey,
            ipfsHash,
        };
    }
}

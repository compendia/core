import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";
import ByteBuffer from "bytebuffer";

import { DposIpfsTransactionGroup, DposIpfsTransactionType, IpfsKeys } from "../enums";
import { IDposIpfsAsset } from "../interfaces";

const { schemas } = Transactions;

export class DposIpfsTransaction extends Transactions.Transaction {
    public static typeGroup: number = DposIpfsTransactionGroup;
    public static type: number = DposIpfsTransactionType.DposIpfs;
    public static key: string = "dposIpfs";

    public static getSchema(): Transactions.schemas.TransactionSchema {
        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "dpofIpfs",
            required: ["asset", "typeGroup"],
            properties: {
                type: { transactionType: DposIpfsTransactionType.DposIpfs },
                typeGroup: { const: DposIpfsTransactionGroup },
                amount: { bignumber: { minimum: 0, maximum: 0 } },
                fee: { bignumber: { minimum: 0, maximum: 0 } },
                asset: {
                    type: "object",
                    required: ["ipfsKey", "ipfsHash"],
                    properties: {
                        ipfsKey: {
                            allOf: [{ type: "string" }, { enum: IpfsKeys }],
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
        const dposIpfsAsset = data.asset as IDposIpfsAsset;
        const ipfsKey: Buffer = Buffer.from(dposIpfsAsset.ipfsKey, "utf8");
        const ipfsHash: Buffer = Buffer.from(dposIpfsAsset.ipfsHash, "utf8");

        const buffer: ByteBuffer = new ByteBuffer(ipfsKey.length + ipfsHash.length + 2, true);

        buffer.writeByte(ipfsKey.length);
        buffer.append(ipfsKey, "hex");

        buffer.writeByte(ipfsHash.length);
        buffer.append(ipfsHash, "hex");

        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;

        const ipfsKeyLength: number = buf.readUint8();
        const ipfsKey: string = buf.readString(ipfsKeyLength);

        const ipfsHashLength: number = buf.readUint8();
        const ipfsHash: string = buf.readString(ipfsHashLength);

        data.asset = {
            ipfsKey,
            ipfsHash,
        };
    }
}

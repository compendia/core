import ByteBuffer from "bytebuffer";
import { Transactions, Utils } from "../../../../packages/crypto";
import { IStakeRegistrationAsset } from "../interfaces";

const { schemas } = Transactions;

const STAKE_TYPE = 100;

export class StakeRegistrationTransaction extends Transactions.Transaction {
    public static type = STAKE_TYPE;

    public static getSchema(): Transactions.schemas.TransactionSchema {
        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "stakeRegistration",
            required: ["asset"],
            properties: {
                type: { transactionType: STAKE_TYPE },
                amount: { bignumber: { minimum: 100000000000 } },
                asset: {
                    type: "object",
                    required: ["stakeRegistration"],
                    properties: {
                        stakeRegistration: {
                            type: "object",
                            required: ["duration"],
                            properties: {
                                name: {
                                    type: "integer",
                                    // Get minimum from config
                                    minimum: 100,
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
        const stakeRegistration = data.asset.stakeRegistration as IStakeRegistrationAsset;

        // TODO: Verify that this works
        const buffer = new ByteBuffer(24, true);
        buffer.writeUint64(+stakeRegistration.duration);
        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;
        const stakeRegistration = {} as IStakeRegistrationAsset;

        data.amount = Utils.BigNumber.make(buf.readUint64().toString());

        data.asset = {
            stakeRegistration,
        };
    }
}

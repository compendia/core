// import { delegates } from "../../../utils/fixtures/testnet/delegates";
import { delegates } from "../../../../__tests__/utils/fixtures/testnet/delegates";
import { stateStorageStub } from "../__fixtures__/state-storage-stub";
import { emitter } from "./emitter";

jest.mock("@arkecosystem/core-container", () => {
    return {
        app: {
            getConfig: () => {
                return {
                    config: { milestones: [{ activeDelegates: 47, height: 1 }] },
                    get: () => ({}),
                    getMilestone: () => ({
                        activeDelegates: 47,
                    }),
                };
            },
            has: name => {
                if (name === "stake.expirations.1241128800") {
                    return false;
                }
                return false;
            },
            register: () => {
                return;
            },
            resolve: () => ({}),
            resolvePlugin: name => {
                if (name === "logger") {
                    return {
                        info: jest.fn(),
                        warn: jest.fn(),
                        error: jest.fn(),
                        debug: jest.fn(),
                    };
                }

                if (name === "event-emitter") {
                    return emitter;
                }

                if (name === "state") {
                    return { getStore: () => stateStorageStub };
                }

                if (name === "database") {
                    return {
                        walletManager: {
                            findByAddress: address => {
                                return {
                                    address: "AJWRd23HNEhPLkK1ymMnwnDBX2a7QBZqff",
                                    balance: "9000000000000",
                                    nonce: "1",
                                    attributes: {
                                        stakePower: "6000000000000",
                                        stakes: {
                                            f4572c8e5602cd5e512e395c62fc02ec790720a73f059c3db9e82aa4d7679b58: [Object],
                                        },
                                    },
                                    publicKey: "03a02b9d5fdd1307c2ee4652ba54d492d1fd11a7d1bb3f3a44c4a05e79f19de933",
                                };
                            },
                        },
                        getActiveDelegates: height => {
                            return delegates;
                        },
                    };
                }

                return {};
            },
        },
    };
});

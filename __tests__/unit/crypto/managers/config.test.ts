import "jest-extended";

import { TransactionTypes } from "../../../../packages/crypto/src/enums";
import { configManager, feeManager } from "../../../../packages/crypto/src/managers";
import { mainnet, unitnet } from "../../../../packages/crypto/src/networks";
import { BigNumber } from "../../../../packages/crypto/src/utils";

beforeEach(() => configManager.setConfig(unitnet));

describe("Configuration", () => {
    it("should be instantiated", () => {
        expect(configManager).toBeObject();
    });

    it("should be set on runtime", () => {
        configManager.setConfig(mainnet);

        expect(configManager.all()).toContainAllKeys(["network", "milestones", "exceptions", "genesisBlock"]);
    });

    it('key should be "set"', () => {
        configManager.set("key", "value");

        expect(configManager.get("key")).toBe("value");
    });

    it('key should be "get"', () => {
        expect(configManager.get("network.nethash")).toBe(
            "a63b5a3858afbca23edefac885be74d59f1a26985548a4082f4f479e74fcc348",
        );
    });

    it("should build milestones", () => {
        expect(configManager.getMilestones()).toEqual(unitnet.milestones);
    });

    it("should build fees", () => {
        const feesStatic = unitnet.milestones[0].fees.staticFees;

        expect(feeManager.get(TransactionTypes.Transfer)).toEqual(BigNumber.make(feesStatic.transfer));
        expect(feeManager.get(TransactionTypes.SecondSignature)).toEqual(BigNumber.make(feesStatic.secondSignature));
        expect(feeManager.get(TransactionTypes.DelegateRegistration)).toEqual(
            BigNumber.make(feesStatic.delegateRegistration),
        );
        expect(feeManager.get(TransactionTypes.Vote)).toEqual(BigNumber.make(feesStatic.vote));
        expect(feeManager.get(TransactionTypes.MultiSignature)).toEqual(BigNumber.make(feesStatic.multiSignature));
        expect(feeManager.get(TransactionTypes.Ipfs)).toEqual(BigNumber.make(feesStatic.ipfs));
        expect(feeManager.get(TransactionTypes.TimelockTransfer)).toEqual(BigNumber.make(feesStatic.timelockTransfer));
        expect(feeManager.get(TransactionTypes.MultiPayment)).toEqual(BigNumber.make(feesStatic.multiPayment));
        expect(feeManager.get(TransactionTypes.DelegateResignation)).toEqual(
            BigNumber.make(feesStatic.delegateResignation),
        );
    });

    it("should update fees on milestone change", () => {
        unitnet.milestones.push({
            height: 100000000,
            fees: { staticFees: { transfer: 1234 } },
        } as any);

        configManager.setHeight(100000000);

        let { staticFees } = configManager.getMilestone().fees;
        expect(feeManager.get(TransactionTypes.Transfer)).toEqual(BigNumber.make(1234));
        expect(feeManager.get(TransactionTypes.SecondSignature)).toEqual(BigNumber.make(staticFees.secondSignature));
        expect(feeManager.get(TransactionTypes.DelegateRegistration)).toEqual(
            BigNumber.make(staticFees.delegateRegistration),
        );
        expect(feeManager.get(TransactionTypes.Vote)).toEqual(BigNumber.make(staticFees.vote));
        expect(feeManager.get(TransactionTypes.MultiSignature)).toEqual(BigNumber.make(staticFees.multiSignature));
        expect(feeManager.get(TransactionTypes.Ipfs)).toEqual(BigNumber.make(staticFees.ipfs));
        expect(feeManager.get(TransactionTypes.TimelockTransfer)).toEqual(BigNumber.make(staticFees.timelockTransfer));
        expect(feeManager.get(TransactionTypes.MultiPayment)).toEqual(BigNumber.make(staticFees.multiPayment));
        expect(feeManager.get(TransactionTypes.DelegateResignation)).toEqual(
            BigNumber.make(staticFees.delegateResignation),
        );

        configManager.setHeight(1);
        staticFees = configManager.getMilestone().fees.staticFees;
        expect(feeManager.get(TransactionTypes.Transfer)).toEqual(BigNumber.make(staticFees.transfer));
        expect(feeManager.get(TransactionTypes.SecondSignature)).toEqual(BigNumber.make(staticFees.secondSignature));
        expect(feeManager.get(TransactionTypes.DelegateRegistration)).toEqual(
            BigNumber.make(staticFees.delegateRegistration),
        );
        expect(feeManager.get(TransactionTypes.Vote)).toEqual(BigNumber.make(staticFees.vote));
        expect(feeManager.get(TransactionTypes.MultiSignature)).toEqual(BigNumber.make(staticFees.multiSignature));
        expect(feeManager.get(TransactionTypes.Ipfs)).toEqual(BigNumber.make(staticFees.ipfs));
        expect(feeManager.get(TransactionTypes.TimelockTransfer)).toEqual(BigNumber.make(staticFees.timelockTransfer));
        expect(feeManager.get(TransactionTypes.MultiPayment)).toEqual(BigNumber.make(staticFees.multiPayment));
        expect(feeManager.get(TransactionTypes.DelegateResignation)).toEqual(
            BigNumber.make(staticFees.delegateResignation),
        );

        unitnet.milestones.pop();
    });

    it("should get milestone for height", () => {
        expect(configManager.getMilestone(75600)).toEqual(unitnet.milestones[2]);
    });

    it("should get milestone for this.height if height is not provided as parameter", () => {
        configManager.setHeight(75600);

        expect(configManager.getMilestone()).toEqual(unitnet.milestones[2]);
    });

    it("should set the height", () => {
        configManager.setHeight(75600);

        expect(configManager.getHeight()).toEqual(75600);
    });

    it("should determine if a new milestone is becoming active", () => {
        for (const milestone of unitnet.milestones) {
            configManager.setHeight(milestone.height);
            expect(configManager.isNewMilestone()).toBeTrue();
        }

        configManager.setHeight(999999);
        expect(configManager.isNewMilestone()).toBeFalse();
    });
});

import { DelegateRegistrationBuilder } from "./transactions/delegate-registration";
import { DelegateResignationBuilder } from "./transactions/delegate-resignation";
import { IPFSBuilder } from "./transactions/ipfs";
import { MultiPaymentBuilder } from "./transactions/multi-payment";
import { MultiSignatureBuilder } from "./transactions/multi-signature";
import { SecondSignatureBuilder } from "./transactions/second-signature";
import { StakeCancelBuilder } from "./transactions/stake-cancel";
import { StakeCreateBuilder } from "./transactions/stake-create";
import { StakeRedeemBuilder } from "./transactions/stake-redeem";
import { StakeUndoCancelBuilder } from "./transactions/stake-undo-cancel";
import { TimelockTransferBuilder } from "./transactions/timelock-transfer";
import { TransferBuilder } from "./transactions/transfer";
import { VoteBuilder } from "./transactions/vote";

export class BuilderFactory {
    public static transfer(): TransferBuilder {
        return new TransferBuilder();
    }

    public static secondSignature(): SecondSignatureBuilder {
        return new SecondSignatureBuilder();
    }

    public static delegateRegistration(): DelegateRegistrationBuilder {
        return new DelegateRegistrationBuilder();
    }

    public static vote(): VoteBuilder {
        return new VoteBuilder();
    }

    public static multiSignature(): MultiSignatureBuilder {
        return new MultiSignatureBuilder();
    }

    public static ipfs(): IPFSBuilder {
        return new IPFSBuilder();
    }

    public static timelockTransfer(): TimelockTransferBuilder {
        return new TimelockTransferBuilder();
    }

    public static multiPayment(): MultiPaymentBuilder {
        return new MultiPaymentBuilder();
    }

    public static delegateResignation(): DelegateResignationBuilder {
        return new DelegateResignationBuilder();
    }

    public static stakeCreate(): StakeCreateBuilder {
        return new StakeCreateBuilder();
    }

    public static stakeCancel(): StakeCancelBuilder {
        return new StakeCancelBuilder();
    }

    public static stakeRedeem(): StakeRedeemBuilder {
        return new StakeRedeemBuilder();
    }

    public static stakeUndoCancel(): StakeUndoCancelBuilder {
        return new StakeUndoCancelBuilder();
    }
}

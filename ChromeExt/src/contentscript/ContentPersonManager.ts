import { Pid } from '../lib/ItemProperties'
import { ContentApp } from './ContentApp';
import { FriendshipProposalsState, FriendshipProposalState } from '../lib/ContentMessage'
import { SimpleToast, Toast } from './Toast'
import { BackgroundMessage } from '../lib/BackgroundMessage'

export class ContentPersonManager
{
    private readonly app: ContentApp

    private readonly proposals: Map<string,FriendshipProposalState> = new Map()
    private openProposals: Map<string,Toast> = new Map() // proposingUserId => toastId

    public constructor(app: ContentApp)
    {
        this.app = app
    }

    public onStateFromBackground(state: FriendshipProposalsState): void
    {
        this.proposals.clear()
        for (const proposal of state.proposed) {
            this.proposals.set(proposal.proposingUserId, proposal)
        }

        for (const [openProposingUserId, toast] of this.openProposals.entries()) {
            if (!this.proposals.has(openProposingUserId)) {
                toast.close()
                this.openProposals.delete(openProposingUserId)
            }
        }

        if (this.openProposals.size === 0 && this.proposals.size !== 0) {
            const cmpFun = (proposalA: FriendshipProposalState, proposalB: FriendshipProposalState) => {
                return proposalA.firstNotificationTime.valueOf() - proposalB.firstNotificationTime.valueOf()
            }
            const proposal = [...this.proposals.values()].sort(cmpFun)[0]
            const toast = this.showProposalFromOtherConfirmationToast(proposal)
            this.openProposals.set(proposal.proposingUserId, toast)
        }
    }

    private showProposalFromOtherConfirmationToast(proposal: FriendshipProposalState): Toast
    {
        const toastId = `FriendshipProposal.${proposal.proposingUserId}`
        const type = 'question'
        const title = this.translateText(proposal, 'FriendshipProposals.proposalToastTitle')
        const text = this.translateText(proposal, 'FriendshipProposals.proposalToastText')
        const toast = new SimpleToast(this.app, toastId, 0, type, title, text)
        toast.setIcon(proposal.proposingUserImageUrl, 10, 32, 64);

        const acceptBtnText = this.translateText(proposal, 'FriendshipProposals.proposalToastAcceptButtonLabel')
        const acceptBtnAction = () => {
            const action = 'N3q.AcceptFriendship'
            const args = { action, [Pid.UserId]: proposal.proposingUserId }
            BackgroundMessage.executeBackpackItemActionOnGenericitem(action, args).catch(error => this.app.onError(error))
        }
        toast.actionButton(acceptBtnText, acceptBtnAction)

        const declineBtnText = this.translateText(proposal, 'FriendshipProposals.proposalToastDeclineButtonLabel')
        const declineBtnAction = () => {
            const action = 'N3q.CancelFriendship'
            const args = { action, [Pid.UserId]: proposal.proposingUserId }
            BackgroundMessage.executeBackpackItemActionOnGenericitem(action, args).catch(error => this.app.onError(error))
        }
        toast.actionButton(declineBtnText, declineBtnAction)

        toast.setDontShow(true)
        toast.show()
        return toast
    }

    private translateText(proposal: FriendshipProposalState, textId: string): string
    {
        return this.app.translateText(textId).replace('{proposingUserName}', proposal.proposingUserName)
    }
}

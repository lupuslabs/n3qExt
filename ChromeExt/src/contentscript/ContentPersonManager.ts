import { as } from '../lib/as'
import { iter } from '../lib/Iter'
import { ErrorWithData } from '../lib/Utils'
import { ItemProperties, PersonData, Pid } from '../lib/ItemProperties'
import { ContentApp } from './ContentApp';
import { FriendshipProposalsState, FriendshipProposalState } from '../lib/ContentMessage'
import { SimpleToast, Toast } from './Toast'
import { BackgroundMessage } from '../lib/BackgroundMessage'
import { WeblinClientIframeApi } from '../lib/WeblinClientIframeApi'

export class ContentPersonManager
{
    private readonly app: ContentApp

    private readonly proposals: Map<string,FriendshipProposalState> = new Map()
    private openProposals: Map<string,Toast> = new Map() // proposingUserId => toastId

    //--------------------------------------------------------------------------
    // Public API

    public constructor(app: ContentApp)
    {
        this.app = app
    }

    public getPersonDataOrNull(otherUserId: string): null|PersonData
    {
        if (otherUserId === this.app.getUserId()) {
            return this.getOwnPersonData()
        }
        const itemPersonData = this.getOtherPersonDataFromBackpack(otherUserId)
        const proposalPersonData = this.getOtherPersonDataFromFriendshipProposal(otherUserId)
        if (itemPersonData?.ownFriendStatus === 'No' && proposalPersonData) {
            itemPersonData.ownFriendStatus = 'ProposedByOther'
        }
        if (itemPersonData) {
            return itemPersonData
        }
        if (proposalPersonData) {
            return proposalPersonData
        }
        return this.getOtherPersonDataFromRoom(otherUserId)
    }

    public getOwnPersonData(): PersonData
    {
        return {
            userId: this.app.getUserId(),
            userName: this.app.getUserNickname(),
            userImageUrl: '',
            ownFriendStatus: 'No',
            ownPersonItem: null,
        }
    }

    public getDummyPersonData(userId: string): PersonData
    {
        return {
            userId: userId,
            userName: '',
            userImageUrl: '',
            ownFriendStatus: 'No',
            ownPersonItem: null,
        }
    }

    public showProposeFriendshipToast(otherPersonData: PersonData): Toast
    {
        const actionArgs = { [Pid.UserId]: otherPersonData.userId }
        const acceptBtnAction = () => BackgroundMessage.executeBackpackItemActionOnGenericitem('N3q.ProposeFriendship', actionArgs)
            .catch(error => this.app.onError(error))
        return this.showPersonActionConfirmationToast(
            otherPersonData, 'Person.proposeFriendshipToastTitle', 'Person.proposeFriendshipToastText',
            'FriendshipProposal', false,
            'Person.proposeFriendshipToastConfirmButtonLabel', acceptBtnAction,
            'Person.proposeFriendshipToastCancelButtonLabel', () => {},
            () => {},
        )
    }

    public showCancelFriendshipToast(otherPersonData: PersonData): Toast
    {
        const actionArgs = { [Pid.UserId]: otherPersonData.userId }
        const acceptBtnAction = () => BackgroundMessage.executeBackpackItemActionOnGenericitem('N3q.CancelFriendship', actionArgs)
            .catch(error => this.app.onError(error))
        return this.showPersonActionConfirmationToast(
            otherPersonData, 'Person.cancelFriendshipToastTitle', 'Person.cancelFriendshipToastText',
            'CancelFriendship', false,
            'Person.cancelFriendshipToastConfirmButtonLabel', acceptBtnAction,
            'Person.cancelFriendshipToastCancelButtonLabel', () => {},
            () => {},
        )
    }

    public showPersonActionConfirmationToast(
        otherPersonData: PersonData, titleId: string, textId: string, actionId: string, allowBlocklist: boolean,
        action1LabelId: string, action1: () => void, action2LabelId: string, action2: () => void, defaultAction: () => void,
    ): Toast {
        const toastId = `${actionId}.${otherPersonData.userId}`
        const type = 'question'
        const title = this.translateText(otherPersonData, titleId)
        const text = this.translateText(otherPersonData, textId)
        const toast = new SimpleToast(this.app, toastId, 0, type, title, text)
        toast.setIcon(otherPersonData.userImageUrl, 10, 64, 64);

        toast.addClosingActionButton(this.translateText(otherPersonData, action1LabelId), action1)
        toast.addClosingActionButton(this.translateText(otherPersonData, action2LabelId), action2)
        toast.setDefaultAction(defaultAction)

        toast.setDontShow(allowBlocklist)
        toast.show()
        return toast
    }

    public onStateFromBackground(state: FriendshipProposalsState): void
    {
        this.proposals.clear()
        for (const proposal of state.proposed) {
            const personData = this.getPersonDataOrNull(proposal.proposingUserId)
            if (!personData || personData.ownFriendStatus !== 'Yes') {
                this.proposals.set(proposal.proposingUserId, proposal)
            }
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
            const otherUserData = this.getPersonDataOrNull(proposal.proposingUserId)
            if (otherUserData?.ownFriendStatus === 'ProposedByOther') {
                const toast = this.showProposalFromOtherConfirmationToast(otherUserData)
                this.openProposals.set(proposal.proposingUserId, toast)
            }
        }
    }

    public handlePersonItemApiRequest(request: WeblinClientIframeApi.Request): void
    {
        const personData: null|PersonData = this.getOtherPersonDataFromBackpack(as.String(request['userId']))
        if (!personData) {
            throw new ErrorWithData('PersonItemApi request contains no own person item\'s ID in item property!', { request })
        }
        switch (as.String(request.type)) {
            case WeblinClientIframeApi.PersonItemApiShowProposeFriendshipToastRequest.type: {
                this.showProposeFriendshipToast(personData)
            } break
            case WeblinClientIframeApi.PersonItemApiShowCancelFriendshipToastRequest.type: {
                this.showCancelFriendshipToast(personData)
            } break
            default: throw new ErrorWithData('Unhandled PersonItemApi request type!', { request })
        }
    }

    //--------------------------------------------------------------------------
    // Private toast helpers

    private showProposalFromOtherConfirmationToast(otherPersonData: PersonData): Toast
    {
        const actionArgs = { [Pid.UserId]: otherPersonData.userId }
        const acceptBtnAction = () => BackgroundMessage.executeBackpackItemActionOnGenericitem('N3q.AcceptFriendship', actionArgs)
            .catch(error => this.app.onError(error))
        const declineBtnAction = () => BackgroundMessage.executeBackpackItemActionOnGenericitem('N3q.CancelFriendship', actionArgs)
            .catch(error => this.app.onError(error))
        return this.showPersonActionConfirmationToast(
            otherPersonData, 'Person.friendshipProposalFromOtherToastTitle', 'Person.friendshipProposalFromOtherToastText',
            'OtherFriendshipProposal', true,
            'Person.friendshipProposalFromOtherToastAcceptButtonLabel', acceptBtnAction,
            'Person.friendshipProposalFromOtherToastDeclineButtonLabel', declineBtnAction,
            () => {}
        )
    }

    private translateText(otherPersonData: PersonData, textId: string): string
    {
        return this.app.translateText(textId).replace('{otherUserName}', otherPersonData.userName)
    }

    //--------------------------------------------------------------------------
    // Private person data retrieval

    private getOtherPersonDataFromBackpack(otherUserId: string): null|PersonData
    {
        return iter(this.app.getOwnItems().values())
            .filter(item => ItemProperties.getIsPerson(item) && ItemProperties.getUserId(item) === otherUserId)
            .map(item => ItemProperties.getPersonData(item))
            .getNext()
    }

    private getOtherPersonDataFromFriendshipProposal(otherUserId: string): null|PersonData
    {
        const proposal = this.proposals.get(otherUserId)
        if (!proposal) {
            return null
        }
        return {
            userId: proposal.proposingUserId,
            userName: proposal.proposingUserName,
            userImageUrl: proposal.proposingUserImageUrl,
            ownFriendStatus: 'ProposedByOther',
            ownPersonItem: null,
        }
    }

    private getOtherPersonDataFromRoom(otherUserId: string): null|PersonData
    {
        const participant = this.app.getRoom()?.getParticipantByUserId(otherUserId)
        if (!(participant?.getSupportsPersonApi() ?? false)) {
            return null
        }
        const userName = participant.getDisplayName()
        if ((userName?.length ?? 0) === 0) {
            return null
        }
        const userAvatar = participant?.getAvatar()
        if (!userAvatar) {
            return null
        }
        const userImageUrl = userAvatar.getAnimationByGroup(userAvatar.getDefaultGroup())?.url ?? null
        if ((userImageUrl?.length ?? 0) === 0) {
            return null
        }
        return { userId: otherUserId, userName, userImageUrl, ownFriendStatus: 'No', ownPersonItem: null }
    }
}

import { is } from '../lib/is'
import { as } from '../lib/as'
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

    private readonly itemPersons: Map<string,Readonly<PersonData>> = new Map() // personId => PersonData
    private readonly openOwnProposalToasts: Map<string,Toast> = new Map() // otherUserId => toast

    private readonly othersProposals: Map<string,FriendshipProposalState> = new Map()
    private readonly openOthersProposalToasts: Map<string,Toast> = new Map() // proposingUserId => toast

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
        const rawItemPersonData: Readonly<PersonData> = this.itemPersons.get(otherUserId)
        const proposalPersonData: PersonData = this.getOtherPersonDataFromFriendshipProposal(otherUserId)
        if (rawItemPersonData) {
            const itemPersonData: PersonData = {...rawItemPersonData}
            if (itemPersonData.ownFriendStatus === 'No' && proposalPersonData) {
                itemPersonData.ownFriendStatus = 'ProposedByOther'
            }
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

    public getMemorizedPersons(): ReadonlyMap<string,Readonly<PersonData>>
    {
        return this.itemPersons
    }

    public showPersonsWindow(aboveElem: null|HTMLElement, filterId: null|string): void
    {
        if (!this.app.getBackpackWindow()) {
            this.app.showBackpackWindow(aboveElem);
        }
        filterId ??= 'persons';
        this.app.getBackpackWindow()?.showFilter(filterId);
    }

    public showProposeFriendshipToast(otherPersonData: Readonly<PersonData>): Toast
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

    public showCancelFriendshipToast(otherPersonData: Readonly<PersonData>): Toast
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
        otherPersonData: Readonly<PersonData>, titleId: string, textId: string, actionId: string, allowBlocklist: boolean,
        action1LabelId: string, action1: () => void, action2LabelId: string, action2: () => void, defaultAction: () => void,
    ): Toast {
        const toastId = `${actionId}.${otherPersonData.userId}`
        const type = 'question'
        const title = this.translateText(otherPersonData, titleId)
        const text = this.translateText(otherPersonData, textId)
        const toast = new SimpleToast(this.app, toastId, 0, type, title, text)
        toast.setIcon(otherPersonData.userImageUrl, 10, 64, 64);

        if (is.nonEmptyString(action1LabelId)) {
            toast.addClosingActionButton(this.translateText(otherPersonData, action1LabelId), action1)
        }
        if (is.nonEmptyString(action2LabelId)) {
            toast.addClosingActionButton(this.translateText(otherPersonData, action2LabelId), action2)
        }
        toast.setDefaultAction(defaultAction)

        toast.setDontShow(allowBlocklist)
        toast.show()
        return toast
    }

    public showFriendshipAcceptedToast(otherPersonData: Readonly<PersonData>): void
    {
        // Only open toast in currently visible tabs to avoid annoying the user
        // Todo: Remove this after implementing autoclosing of all toasts with
        //       same Id in all tabs after user interacts with one of them.
        if (!this.app.getViewPortEventDispatcher().getVisibility()) {
            return
        }

        const otherUserId: string = otherPersonData.userId
        if (!is.nil(this.openOwnProposalToasts.get(otherUserId))) {
            return
        }
        const toast: Toast = this.showPersonActionConfirmationToast(
            otherPersonData, 'Person.friendshipAcceptedToastTitle', 'Person.friendshipAcceptedToastText',
            'OwnFriendshipProposalAccepted', true,
            '', () => {},
            '', () => {},
            () => {},
        )
        this.openOwnProposalToasts.set(otherUserId, toast)
    }

    public hideFriendshipAcceptedToast(otherPersonData: Readonly<PersonData>): void
    {
        const otherUserId: string = otherPersonData.userId
        this.openOwnProposalToasts.get(otherUserId)?.close()
        this.openOwnProposalToasts.delete(otherUserId)
    }

    public onBackpackUpdate(itemsHide: ReadonlyArray<ItemProperties>, itemsShowOrSet: ReadonlyArray<ItemProperties>): void
    {
        for (const item of itemsHide) {
            if (ItemProperties.getIsPerson(item)) {
                const personData: PersonData = ItemProperties.getPersonData(item)
                this.hideFriendshipAcceptedToast(personData)
                this.itemPersons.delete(personData.userId)
            }
        }
        for (const item of itemsShowOrSet) {
            if (ItemProperties.getIsPerson(item)) {
                const newPersonData: PersonData = ItemProperties.getPersonData(item)
                const oldPersonData: null|PersonData = this.itemPersons.get(newPersonData.userId) ?? null

                if (oldPersonData?.ownFriendStatus === 'ProposedByOwner' && newPersonData.ownFriendStatus === 'Yes') {
                    this.showFriendshipAcceptedToast(newPersonData)
                } else if (oldPersonData?.ownFriendStatus !== newPersonData.ownFriendStatus) {
                    this.hideFriendshipAcceptedToast(newPersonData)
                }
                this.itemPersons.set(newPersonData.userId, newPersonData)
            }
        }
    }

    public onStateFromBackground(state: FriendshipProposalsState): void
    {
        this.othersProposals.clear()
        for (const proposal of state.proposed) {
            const personData = this.getPersonDataOrNull(proposal.proposingUserId)
            if (!personData || personData.ownFriendStatus !== 'Yes') {
                this.othersProposals.set(proposal.proposingUserId, proposal)
            }
        }

        for (const [openProposingUserId, toast] of this.openOthersProposalToasts.entries()) {
            if (!this.othersProposals.has(openProposingUserId)) {
                toast.close()
                this.openOthersProposalToasts.delete(openProposingUserId)
            }
        }

        if (this.openOthersProposalToasts.size === 0 && this.othersProposals.size !== 0) {
            const cmpFun = (proposalA: FriendshipProposalState, proposalB: FriendshipProposalState) => {
                return proposalA.firstNotificationTime.valueOf() - proposalB.firstNotificationTime.valueOf()
            }
            const proposal = [...this.othersProposals.values()].sort(cmpFun)[0]
            const otherUserData = this.getPersonDataOrNull(proposal.proposingUserId)
            if (otherUserData?.ownFriendStatus === 'ProposedByOther') {
                const toast = this.showProposalFromOtherConfirmationToast(otherUserData)
                this.openOthersProposalToasts.set(proposal.proposingUserId, toast)
            }
        }
    }

    public handlePersonItemApiRequest(request: WeblinClientIframeApi.Request): void
    {
        const personData: null|Readonly<PersonData> = this.itemPersons.get(as.String(request['userId'])) ?? null
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

    private showProposalFromOtherConfirmationToast(otherPersonData: Readonly<PersonData>): Toast
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

    private translateText(otherPersonData: Readonly<PersonData>, textId: string): string
    {
        return this.app.translateText(textId).replace('{otherUserName}', otherPersonData.userName)
    }

    //--------------------------------------------------------------------------
    // Private person data retrieval

    private getOtherPersonDataFromFriendshipProposal(otherUserId: string): null|PersonData
    {
        const proposal = this.othersProposals.get(otherUserId)
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
        const userName = participant?.getDisplayName() ?? null
        if ((userName?.length ?? 0) === 0) {
            return null
        }
        const userAvatar = participant?.getAvatar()
        const userImageUrl = userAvatar?.getAnimationByGroup(userAvatar.getDefaultGroup())?.url ?? ''
        return {
            userId: otherUserId,
            userName,
            userImageUrl,
            ownFriendStatus: 'No',
            ownPersonItem: null,
        }
    }
}

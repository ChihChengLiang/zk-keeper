import pushMessage from '@src/util/pushMessage'
import { EventEmitter2 } from 'eventemitter2'
import { FinalizedRequest, PendingRequest, PendingRequestType, RequestResolutionAction } from '@src/types'
import { setPendingRequest } from '@src/ui/ducks/requests'
import BrowserUtils from './browser-utils'

let nonce = 0

export default class RequestManager extends EventEmitter2 {
    private pendingRequests: Array<PendingRequest>
    private popupId: number

    constructor() {
        super()
        this.pendingRequests = []
        this.popupId = 0
    }

    getRequests = (): PendingRequest[] => this.pendingRequests

    finalizeRequest = async (payload: FinalizedRequest): Promise<boolean> => {
        const { id, action } = payload
        if (!id) throw new Error('id not provided')
        if (!action) throw new Error('action is not provided')
        // TODO add some mutex lock just in case something strange occurs
        this.pendingRequests = this.pendingRequests.filter((pendingRequest: PendingRequest) => pendingRequest.id !== id)
        this.emit(`${id}:finalized`, action)
        await pushMessage(setPendingRequest(this.pendingRequests))
        return true
    }

    addToQueue = async (type: PendingRequestType, payload?: any): Promise<string> => {
        // eslint-disable-next-line no-plusplus
        const id: string = `${nonce++}`
        this.pendingRequests.push({ id, type, payload })
        await pushMessage(setPendingRequest(this.pendingRequests))
        await this.handlePopup()
        return id
    }

    newRequest = async (data: any, type: PendingRequestType, payload?: any) => {
        const id: string = await this.addToQueue(type, payload)
        return new Promise((resolve, reject) => {
            this.once(`${id}:finalized`, (action: RequestResolutionAction) => {
                switch (action) {
                    case 'accept':
                        resolve(data)
                        return
                    case 'reject':
                        // eslint-disable-next-line prefer-promise-reject-errors
                        reject(null)
                        return
                    default:
                        throw new Error(`action: ${action} not supproted`)
                }
            })
        })
    }

    isPopupOpened = async () => {
        const windows = await BrowserUtils.getAllWindows()
        if (!windows) return null // IF nothing is open -> popup is not open

        /** We must ensure that type of window is popup because before popup is opened
         *  not active tab with same id is created (check openTab in BrowserUtils)
         */
        return windows.find((window) => window && window.type === 'popup' && window.id === this.popupId)
    }

    handlePopup = async () => {
        const popup = await this.isPopupOpened()

        if (popup) {
            BrowserUtils.focusWindow(this.popupId)
        } else {
            const newPopup = await BrowserUtils.openPopup()
            if (!newPopup) throw new Error('Something went wrong in opening popup')
            const { id } = newPopup
            if (!id) throw new Error('Something went wrong in opening popup')
            this.popupId = id
        }
    }
}

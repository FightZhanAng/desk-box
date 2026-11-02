import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DeskboxApi } from '../shared/api'
import { IPC } from '../shared/types'
import type { ActionResult, AppState, NewItemInput, Settings, UpdateState } from '../shared/types'

const api: DeskboxApi = {
  getState: () => ipcRenderer.invoke(IPC.stateGet) as Promise<AppState>,

  addItem: (input: NewItemInput) => ipcRenderer.invoke(IPC.itemAdd, input) as Promise<ActionResult>,
  addPaths: (paths: string[], groupId?: string) =>
    ipcRenderer.invoke(IPC.itemAddPaths, paths, groupId) as Promise<ActionResult>,
  updateItem: (id: string, patch: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC.itemUpdate, id, patch) as Promise<ActionResult>,
  removeItem: (id: string) => ipcRenderer.invoke(IPC.itemRemove, id) as Promise<ActionResult>,

  openItem: (id: string) => ipcRenderer.invoke(IPC.itemOpen, id) as Promise<ActionResult>,
  revealItem: (id: string) => ipcRenderer.invoke(IPC.itemReveal, id) as Promise<ActionResult>,
  copyItem: (id: string) => ipcRenderer.invoke(IPC.itemCopy, id) as Promise<ActionResult>,

  updateItems: (ids: string[], patch: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC.itemUpdateMany, ids, patch) as Promise<ActionResult>,
  removeItems: (ids: string[]) =>
    ipcRenderer.invoke(IPC.itemRemoveMany, ids) as Promise<ActionResult>,
  openItems: (ids: string[]) => ipcRenderer.invoke(IPC.itemOpenMany, ids) as Promise<ActionResult>,

  showItemMenu: (id: string) => {
    ipcRenderer.send(IPC.itemMenu, id)
  },
  showBatchMenu: (ids: string[]) => {
    ipcRenderer.send(IPC.itemMenuMany, ids)
  },
  startDrag: (id: string) => {
    ipcRenderer.send(IPC.itemDrag, id)
  },

  addGroup: (name: string) => ipcRenderer.invoke(IPC.groupAdd, name) as Promise<ActionResult>,
  renameGroup: (id: string, name: string) =>
    ipcRenderer.invoke(IPC.groupRename, id, name) as Promise<ActionResult>,
  removeGroup: (id: string) => ipcRenderer.invoke(IPC.groupRemove, id) as Promise<ActionResult>,

  patchSettings: (patch: Partial<Settings>) =>
    ipcRenderer.invoke(IPC.settingsPatch, patch) as Promise<ActionResult>,

  pickFiles: () => ipcRenderer.invoke(IPC.pickFiles) as Promise<ActionResult>,
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder) as Promise<ActionResult>,

  readClipboard: () => ipcRenderer.invoke(IPC.readClipboard) as Promise<string>,
  openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, url) as Promise<ActionResult>,

  exportData: () => ipcRenderer.invoke(IPC.exportData) as Promise<ActionResult>,
  importData: () => ipcRenderer.invoke(IPC.importData) as Promise<ActionResult>,

  hideWindow: () => ipcRenderer.invoke(IPC.windowHide) as Promise<void>,
  togglePin: () => ipcRenderer.invoke(IPC.windowTogglePin) as Promise<ActionResult>,

  getPathForFile: (file: unknown) => webUtils.getPathForFile(file as File),

  onStateChanged: (callback: (state: AppState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState): void => {
      callback(state)
    }
    ipcRenderer.on(IPC.stateChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC.stateChanged, listener)
    }
  },

  getItemIcon: (id: string) => ipcRenderer.invoke(IPC.itemIcon, id) as Promise<string | null>,

  getUpdate: () => ipcRenderer.invoke(IPC.updateGet) as Promise<UpdateState>,
  checkUpdate: () => ipcRenderer.invoke(IPC.updateCheck) as Promise<UpdateState>,
  downloadUpdate: () => ipcRenderer.invoke(IPC.updateDownload) as Promise<UpdateState>,
  installUpdate: () => ipcRenderer.invoke(IPC.updateInstall) as Promise<void>,
  openUpdatePage: () => ipcRenderer.invoke(IPC.updateOpenPage) as Promise<void>,

  onUpdateChanged: (callback: (state: UpdateState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState): void => {
      callback(state)
    }
    ipcRenderer.on(IPC.updateChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC.updateChanged, listener)
    }
  }
}

contextBridge.exposeInMainWorld('deskbox', api)

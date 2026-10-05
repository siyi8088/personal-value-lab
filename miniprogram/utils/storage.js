const DRAFT_KEY = 'quick_profile_v1'
const RESULT_KEY = 'quick_result_v1'
const SAVED_ACTION_KEY = 'quick_saved_action_v1'

function get(key) {
  try {
    return wx.getStorageSync(key) || null
  } catch (error) {
    return null
  }
}

function set(key, value) {
  wx.setStorageSync(key, value)
}

function remove(key) {
  wx.removeStorageSync(key)
}

const WORKBENCH_KEY = 'dcf_workbench_v1'

function getDraft() { return get(DRAFT_KEY) }
function saveDraft(profile) { set(DRAFT_KEY, profile) }
function getResult() { return get(RESULT_KEY) }
function saveResult(result) { set(RESULT_KEY, result) }
function getSavedAction() { return get(SAVED_ACTION_KEY) }
function saveAction(action) { set(SAVED_ACTION_KEY, action) }
function getWorkbenchProfile() { return get(WORKBENCH_KEY) }
function saveWorkbenchProfile(profile) { set(WORKBENCH_KEY, profile) }
function clearWorkbenchData() { remove(WORKBENCH_KEY) }

function clearQuickData() {
  remove(DRAFT_KEY)
  remove(RESULT_KEY)
  remove(SAVED_ACTION_KEY)
  remove(WORKBENCH_KEY)
}

module.exports = {
  getDraft,
  saveDraft,
  getResult,
  saveResult,
  getSavedAction,
  saveAction,
  getWorkbenchProfile,
  saveWorkbenchProfile,
  clearWorkbenchData,
  clearQuickData
}

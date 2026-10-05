// Tests for lib/emailPc.js (MAIL-6 "One morning email, from one PC"): which PC sends the daily
// email, how saves and restores change that, and when the Windows task must change.
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { sendsFromThisPc, flagAfterSave, flagAfterRestore, wantsTask, taskChange } from "../lib/emailPc.js";

test("settings saved before this existed keep sending from this PC", () => {
  assert.equal(sendsFromThisPc({}), true);
  assert.equal(sendsFromThisPc({ digestOnThisPc: "" }), true);
  assert.equal(sendsFromThisPc({ digestOnThisPc: "yes" }), true);
  assert.equal(sendsFromThisPc({ digestOnThisPc: "no" }), false);
  assert.equal(sendsFromThisPc(null), true);
});

test("Settings saves keep this PC's choice; turning the email on from off makes this PC send it", () => {
  assert.equal(flagAfterSave({ wasOn: true, isOn: true, flag: "no" }), "no");
  assert.equal(flagAfterSave({ wasOn: true, isOn: true, flag: "yes" }), "yes");
  assert.equal(flagAfterSave({ wasOn: true, isOn: true, flag: "" }), "");
  assert.equal(flagAfterSave({ wasOn: false, isOn: true, flag: "no" }), "yes");
  assert.equal(flagAfterSave({ wasOn: true, isOn: false, flag: "no" }), "no");
  assert.equal(flagAfterSave({ wasOn: true, isOn: true, flag: "no", here: true }), "yes");
  assert.equal(flagAfterSave({ wasOn: true, isOn: true, flag: "yes", here: false }), "no");
});

test("restore: anything but a clear yes leaves the email paused on this PC", () => {
  assert.equal(flagAfterRestore({ emailOn: true, sendHere: true }), "yes");
  assert.equal(flagAfterRestore({ emailOn: true, sendHere: false }), "no");
  assert.equal(flagAfterRestore({ emailOn: true }), "no");
  assert.equal(flagAfterRestore({ emailOn: true, sendHere: "yes" }), "no");
  assert.equal(flagAfterRestore({ emailOn: false, sendHere: true }), "");
});

test("the Windows task exists only when the email is on AND this PC sends it", () => {
  assert.equal(wantsTask(true, { digestOnThisPc: "" }), true);
  assert.equal(wantsTask(true, { digestOnThisPc: "no" }), false);
  assert.equal(wantsTask(false, { digestOnThisPc: "yes" }), false);
});

test("task changes: pause removes it, resume adds it, a time change re-registers it", () => {
  const on = { sendTime: "07:00", sendDays: "weekdays", digestOnThisPc: "yes" };
  const paused = { ...on, digestOnThisPc: "no" };
  // Pausing (or restoring onto a PC that sent it and answering No) removes the task.
  assert.deepEqual(taskChange({ before: on, after: paused, enabledBefore: true, enabledAfter: true }), { needed: true, enabled: false });
  assert.deepEqual(taskChange({ before: paused, after: on, enabledBefore: true, enabledAfter: true }), { needed: true, enabled: true });
  assert.deepEqual(taskChange({ before: on, after: on, enabledBefore: true, enabledAfter: true }), { needed: false, enabled: true });
  assert.deepEqual(taskChange({ before: on, after: { ...on, sendTime: "09:30" }, enabledBefore: true, enabledAfter: true }), { needed: true, enabled: true });
  // Paused here: a new time never creates the task.
  assert.equal(taskChange({ before: paused, after: { ...paused, sendTime: "09:30" }, enabledBefore: true, enabledAfter: true }).enabled, false);
  // A fresh PC restoring with No: nothing to do.
  assert.deepEqual(taskChange({ before: { sendTime: "07:00", sendDays: "weekdays" }, after: { ...paused }, enabledBefore: false, enabledAfter: true }), { needed: false, enabled: false });
});

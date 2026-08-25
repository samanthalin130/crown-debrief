// Where the app gets its data when a server is running.
//
// This is the only file that differs between the local dev panel and the static
// site published for the lab. Everything else -- the analysis, the debrief, the
// ribbon, the guide -- is identical, which is what makes the published version a
// build step rather than a rewrite.

export const source = {
  kind: "server",
  live: true,
  privacyNote: null,

  async listSessions() {
    const { sessions } = await (await fetch("/api/sessions")).json();
    return sessions || [];
  },
  async readSession(name) {
    return (await fetch(`/api/session?name=${encodeURIComponent(name)}`)).text();
  },
  async getBaseline() {
    return (await fetch("/api/baseline")).json();
  },
  async getNotes(date) {
    const r = await fetch(`/api/notes?date=${date}`).then((x) => x.json()).catch(() => ({ notes: [] }));
    return r.notes || [];
  },
  async saveNote(note) {
    const r = await (await fetch("/api/notes", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(note),
    })).json();
    return r.ok ? r.note : null;
  },
  async getActivities(date) {
    const r = await fetch(`/api/activities?date=${date}`).then((x) => x.json()).catch(() => ({ activities: [] }));
    return r.activities || [];
  },
  async saveActivity(act) {
    const r = await (await fetch("/api/activities", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(act),
    })).json();
    return r.ok ? r.activity : null;
  },
  async getTags() {
    const { tags } = await (await fetch("/api/tags")).json();
    return tags || [];
  },
  subscribeLive(onFrame) {
    const es = new EventSource("/api/stream");
    es.onmessage = (e) => onFrame(JSON.parse(e.data));
    return () => es.close();
  },
};

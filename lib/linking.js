// Some announcements are really about an assignment already on the board (like "Quiz 3 is open").
// Those get attached to the matching card instead of showing up twice.

function words(text = "") {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

export function linkAnnouncements(items, announcements) {
  const linkedIds = new Set();
  const out = items.map((i) => ({ ...i, announcements: [] }));

  for (const a of announcements) {
    const title = words(a.title);
    const match = out.find((i) => {
      if (i.courseId !== a.courseId || i.type === "planner_note") return false;
      const itemTitle = words(i.title);
      return itemTitle.trim().length >= 5 && title.includes(itemTitle);
    });
    if (match) {
      match.announcements.push({ id: a.id, courseId: a.courseId, title: a.title, url: a.url, read: a.read });
      linkedIds.add(a.id);
    }
  }

  return { items: out, announcements: announcements.filter((a) => !linkedIds.has(a.id)) };
}

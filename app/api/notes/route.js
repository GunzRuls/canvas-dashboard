import { createPlannerNote, deletePlannerNote } from "@/lib/canvas";

// Add a personal to-do. It's saved as a Canvas planner note, so it shows up in Canvas too.
export async function POST(request) {
  try {
    const { title, date, courseId } = await request.json();
    if (!title?.trim()) throw new Error("Give the to-do a title.");
    const note = await createPlannerNote({ title: title.trim(), date, courseId });
    return Response.json({ ok: true, id: note.id });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { id } = await request.json();
    await deletePlannerNote(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

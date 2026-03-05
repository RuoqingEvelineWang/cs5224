import { useState } from "react";
import { createEvent } from "../api/Event.tsx";

type Friend = {
  id: string;
  name: string;
};

export default function CreateEvent() {
  const [friends] = useState<Friend[]>([
    { id: "f1", name: "Alice" },
    { id: "f2", name: "Bob" },
    { id: "f3", name: "Charlie" }
  ]);

  const [selected, setSelected] = useState<string[]>([]);

  function toggleFriend(friendId: string) {
    if (selected.includes(friendId)) {
      setSelected(selected.filter(id => id !== friendId));
    } else {
      setSelected([...selected, friendId]);
    }
  }

  async function handleCreate() {
    await createEvent(selected);
    alert("Event created (placeholder)");
  }

  return (
    <div>
      <h2>Select Friends</h2>

      {friends.map(friend => (
        <div key={friend.id}>
          <label>
            <input
              type="checkbox"
              checked={selected.includes(friend.id)}
              onChange={() => toggleFriend(friend.id)}
            />
            {friend.name}
          </label>
        </div>
      ))}

      <button
        style={{ marginTop: 20 }}
        onClick={handleCreate}
      >
        Create Event
      </button>
    </div>
  );
}
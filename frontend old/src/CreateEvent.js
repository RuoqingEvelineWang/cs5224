import { useEffect, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

export default function CreateEvent() {
  const [friends, setFriends] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    const session = await fetchAuthSession();
    const token = session.tokens.idToken.toString();

    const res = await fetch("YOUR_API/friends", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    setFriends(data);
  };

  const createEvent = async () => {
    const session = await fetchAuthSession();
    const token = session.tokens.idToken.toString();

    await fetch("YOUR_API/createEvent", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ participants: selected })
    });

    alert("Event created!");
  };

  return (
    <div>
      <h2>Select Friends</h2>
      {friends.map(f => (
        <div key={f}>
          <input
            type="checkbox"
            onChange={(e) => {
              if (e.target.checked) {
                setSelected([...selected, f]);
              } else {
                setSelected(selected.filter(x => x !== f));
              }
            }}
          />
          {f}
        </div>
      ))}
      <button onClick={createEvent}>Create</button>
    </div>
  );
}
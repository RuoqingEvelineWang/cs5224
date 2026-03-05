export type Event = {
  eventId: string;
};

export async function fetchEvents(): Promise<Event[]> {
  // Placeholder until backend ready

  return new Promise(resolve => {
    setTimeout(() => {
      resolve([
        { eventId: "event-1" },
        { eventId: "event-2" },
        { eventId: "event-3" }
      ]);
    }, 500);
  });
}

export async function createEvent(friendIds: string[]) {
  console.log("Creating event with friends:", friendIds);

  // placeholder for POST API call
}
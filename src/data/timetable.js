// CUI Lahore, FA25-ELC-C, Fall 2026
// Transcribed from the published timetable, version 2026-09-20.
//
// This is the fallback shown before a CR publishes the live data to Firestore.
// Once published, edit it in the app (Manage -> Timetable), not here.
//
// Colours are a harmonised categorical set: every hue sits at roughly the same
// saturation and lightness, so no single subject shouts louder than the rest.
// They read as one family in both themes. Raw Tailwind 500s do not.
export const subjects = {
  CSC241: { title: "Object Oriented Programming",        short: "OOP",              teacher: "",                              credits: 4, color: "#5b93ce" },
  EEE231: { title: "Electronics I",                      short: "Electronics",      teacher: "Dr. Habib",                     credits: 4, color: "#cf7f63" },
  HUM122: { title: "Fundamentals of Psychology",         short: "Psychology",       teacher: "Tehmina Zubair (VF)",           credits: 3, color: "#9a7fce" },
  HUM162: { title: "Understanding of Holy Quran-II",     short: "Quran-II",         teacher: "Dr. Hafiz Naseer Ahmad (VF)",   credits: 1, color: "#4fa87b", online: true },
  MGT250: { title: "Introduction to Entrepreneurship",   short: "Entrepreneurship", teacher: "Samra Dar (VF)",                credits: 3, color: "#ce6e8e" },
  MTH103: { title: "Exploring Quantitative Skills",      short: "Quant Skills",     teacher: "Mubeen Naz (VF)",               credits: 3, color: "#45a79f" },
  MTH241: { title: "Ordinary Differential Equation",     short: "ODE",              teacher: "Prof. Dr. Muhammad Younas",     credits: 3, color: "#cfa153" }
};

// Days: 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
export const timetable = [
  // Monday. Psychology is published as two back-to-back one-hour cells rather
  // than a single two-hour block, so it is kept that way here.
  { day: 1, start: "09:30", end: "10:30", code: "HUM122", room: "B-5",   type: "Lecture" },
  { day: 1, start: "10:30", end: "11:30", code: "HUM122", room: "B-5",   type: "Lecture" },
  { day: 1, start: "11:30", end: "13:30", code: "MGT250", room: "N-23",  type: "Lecture" },
  { day: 1, start: "16:00", end: "17:30", code: "CSC241", room: "A-6",   type: "Lecture" },

  // Wednesday
  { day: 3, start: "08:30", end: "11:30", code: "EEE231", room: "A-14",  type: "LAB" },
  { day: 3, start: "11:30", end: "13:00", code: "MTH241", room: "D-109", type: "Lecture" },
  { day: 3, start: "14:30", end: "16:00", code: "EEE231", room: "N-15",  type: "Lecture" },
  { day: 3, start: "16:00", end: "17:30", code: "CSC241", room: "N-23",  type: "Lecture" },

  // Thursday
  { day: 4, start: "08:30", end: "10:00", code: "MTH241", room: "N-23",  type: "Lecture" },
  { day: 4, start: "14:30", end: "16:00", code: "MTH103", room: "O-3",   type: "Lecture" },
  { day: 4, start: "16:00", end: "17:30", code: "EEE231", room: "D-15",  type: "Lecture" },

  // Saturday
  { day: 6, start: "10:00", end: "11:30", code: "MTH103", room: "O-3",   type: "Lecture" },
  { day: 6, start: "11:30", end: "14:30", code: "CSC241", room: "C-1",   type: "LAB" }
];

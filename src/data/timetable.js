// Fall 2026 - FA25-ELC-C
// credits: theory + lab credit hours (edit if your transcript says otherwise)
export const subjects = {
  CSC241: { title: "Object Oriented Programming", short: "OOP",            teacher: "Not listed", credits: 4, color: "#0ea5e9" },
  EEE231: { title: "Electronics I",               short: "Electronics",    teacher: "Dr. Habib", credits: 4, color: "#f97316" },
  HUM122: { title: "Fundamentals of Psychology",  short: "Psychology",     teacher: "Tehmina Zubair (VF)", credits: 3, color: "#a855f7" },
  HUM162: { title: "Understanding of Holy Quran-II", short: "Quran-II",    teacher: "Dr. Hafiz Naseer Ahmad (VF)", credits: 1, color: "#22c55e", online: true },
  MGT250: { title: "Introduction to Entrepreneurship", short: "Entrepreneurship", teacher: "Samra Dar (VF)", credits: 3, color: "#ec4899" },
  MTH103: { title: "Exploring Quantitative Skills", short: "Quant Skills", teacher: "Kiran Naz (VF)", credits: 3, color: "#14b8a6" },
  MTH241: { title: "Ordinary Differential Equation", short: "ODE",         teacher: "Prof. Dr. Muhammad Younas", credits: 3, color: "#eab308" }
};

export const subjectName = (code) => subjects[code]?.title || code;

// Days: 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
export const timetable = [
  // Monday
  { day: 1, start: "10:30", end: "11:30", code: "HUM122", room: "A-2",   type: "Lecture" },
  { day: 1, start: "11:30", end: "13:30", code: "MGT250", room: "N-23",  type: "Lecture" },
  // Wednesday
  { day: 3, start: "08:30", end: "11:30", code: "EEE231", room: "A-14",  type: "LAB" },
  { day: 3, start: "11:30", end: "13:00", code: "MTH241", room: "D-109", type: "Lecture" },
  { day: 3, start: "14:30", end: "16:00", code: "EEE231", room: "N-15",  type: "Lecture" },
  // Thursday
  { day: 4, start: "08:30", end: "10:00", code: "MTH241", room: "N-23",  type: "Lecture" },
  { day: 4, start: "10:30", end: "11:30", code: "HUM122", room: "D-118", type: "Lecture" },
  { day: 4, start: "14:30", end: "16:00", code: "MTH103", room: "O-3",   type: "Lecture" },
  { day: 4, start: "16:00", end: "17:30", code: "EEE231", room: "D-15",  type: "Lecture" },
  // Saturday
  { day: 6, start: "08:30", end: "10:00", code: "CSC241", room: "C-6",   type: "Lecture" },
  { day: 6, start: "10:00", end: "11:30", code: "MTH103", room: "O-3",   type: "Lecture" },
  { day: 6, start: "11:30", end: "14:30", code: "CSC241", room: "C-1",   type: "LAB" },
  { day: 6, start: "14:30", end: "16:00", code: "CSC241", room: "C-6",   type: "Lecture" }
];

// Sessions per week per subject (used for attendance projections). HUM162 is online, assume 1/week.
export const weeklySessions = Object.keys(subjects).reduce((acc, code) => {
  acc[code] = timetable.filter(t => t.code === code).length || 1;
  return acc;
}, {});

export const SEMESTER_WEEKS = 16;

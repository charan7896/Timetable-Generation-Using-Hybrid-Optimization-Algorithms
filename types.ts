export interface Subject {
  id: string;
  name: string;
  hoursPerWeek: number;
  sections: number[];
  isLabOrTutorial: boolean;
}

export interface Faculty {
  id: string;
  name: string;
  subjects: string[];
  allottedSections: number[];
}

export interface Room {
  id: string;
  capacity: number;
  type: 'LAB' | 'THEORY';
}

export interface TimeSlot {
  day: number; // 0 to 5 (Mon-Sat)
  period: number; // 1 to 8
}

export interface ScheduleEntry {
  subjectId: string;
  facultyId: string;
  section: number;
  day: number;
  period: number;
  roomId?: string;
}

export type Timetable = Record<number, ScheduleEntry[]>; // Section -> List of entries

export interface PeriodInfo {
  no: number;
  time: string;
  type: 'Teaching' | 'Break';
}

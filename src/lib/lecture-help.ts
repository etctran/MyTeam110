/** Groups the flat, one-row-per-(section,day) LectureHelpSlot rows back
 * into sections spanning multiple days for display — mirrors the real
 * recitation-schedule shape (one section, several meeting days, a
 * possibly-different roster each day). */
export type LectureHelpSlotWithSignups = {
  id: string;
  courseInfo: string;
  instructors: string;
  location: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  signups: { id: string; user: { id: string; name: string } }[];
};

export type LectureHelpSection = {
  key: string;
  courseInfo: string;
  instructors: string;
  location: string;
  startTime: string;
  endTime: string;
  days: LectureHelpSlotWithSignups[];
};

export function groupLectureHelpSections(slots: LectureHelpSlotWithSignups[]): LectureHelpSection[] {
  const groups = new Map<string, LectureHelpSection>();

  for (const slot of slots) {
    const key = `${slot.courseInfo}__${slot.instructors}__${slot.location}__${slot.startTime}__${slot.endTime}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        courseInfo: slot.courseInfo,
        instructors: slot.instructors,
        location: slot.location,
        startTime: slot.startTime,
        endTime: slot.endTime,
        days: [],
      };
      groups.set(key, group);
    }
    group.days.push(slot);
  }

  const result = [...groups.values()];
  for (const group of result) group.days.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  result.sort((a, b) => a.courseInfo.localeCompare(b.courseInfo));
  return result;
}

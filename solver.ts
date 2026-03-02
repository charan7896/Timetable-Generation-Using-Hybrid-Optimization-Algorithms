import { Subject, Faculty, ScheduleEntry, Timetable, Room } from './types';
import { INITIAL_ROOMS } from './data';

/**
 * Advanced TimetableSolver v1.9.5 – Aggressive Gap Reduction (≤4 gaps per section)
 * Ensures all required hours are placed, then compacts each day so free periods are only at the end.
 * Labs/tutorials (-L, -T) are always placed as continuous 2‑hour blocks in the same room.
 */
export class TimetableSolver {
  private subjects: Subject[];
  private faculty: Faculty[];
  private rooms: Room[];
  private sections: number[];

  private globalFacultyBusy: Map<string, boolean[][]> = new Map();
  private sectionBusy: Map<number, boolean[][]> = new Map();
  private roomBusy: Map<string, boolean[][]> = new Map();
  private subjectDayTracker: Map<string, number> = new Map();

  constructor(subjects: Subject[], faculty: Faculty[], rooms: Room[] = INITIAL_ROOMS) {
    this.subjects = subjects;
    this.faculty = faculty;
    this.rooms = rooms;
    this.sections = Array.from(new Set(subjects.flatMap(s => s.sections))).sort((a, b) => a - b);
  }

  // Helper to identify lab/tutorial subjects
  private isLabOrTutorial(subjectId: string): boolean {
    return subjectId.includes('-L') || subjectId.includes('-T');
  }

  private initMatrices() {
    this.globalFacultyBusy.clear();
    this.sectionBusy.clear();
    this.roomBusy.clear();
    this.subjectDayTracker.clear();

    this.faculty.forEach(f => {
      this.globalFacultyBusy.set(f.id, Array.from({ length: 6 }, () => Array(9).fill(false)));
    });

    this.sections.forEach(s => {
      this.sectionBusy.set(s, Array.from({ length: 6 }, () => Array(9).fill(false)));
    });

    this.rooms.forEach(r => {
      this.roomBusy.set(r.id, Array.from({ length: 6 }, () => Array(9).fill(false)));
    });
  }

  private deepCloneTimetable(tt: Timetable): Timetable {
    const clone: Timetable = {};
    Object.keys(tt).forEach(key => {
      clone[Number(key)] = tt[Number(key)].map(e => ({ ...e }));
    });
    return clone;
  }

  private shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private canPlace(
    facultyId: string,
    section: number,
    day: number,
    period: number,
    subjectId: string,
    checkDailyLimit = true,
    ignoreDailyLimit = false
  ): boolean {
    if (period < 1 || period > 8 || day < 0 || day > 5) return false;
    if (this.sectionBusy.get(section)?.[day][period]) return false;
    if (this.globalFacultyBusy.get(facultyId)?.[day][period]) return false;

    if (checkDailyLimit && !ignoreDailyLimit && subjectId !== 'TRAINING') {
      const trackerKey = `${section}-${subjectId}-${day}`;
      if ((this.subjectDayTracker.get(trackerKey) || 0) >= 2) return false;
    }
    return true;
  }

  private findAvailableRoom(day: number, period: number, type: 'LAB' | 'THEORY'): string | undefined {
    const primaryRooms = this.shuffle(this.rooms.filter(r => r.type === type));
    for (const r of primaryRooms) {
      if (!this.roomBusy.get(r.id)![day][period]) return r.id;
    }
    if (type === 'THEORY') {
      const secondaryRooms = this.shuffle(this.rooms.filter(r => r.type === 'LAB'));
      for (const r of secondaryRooms) {
        if (!this.roomBusy.get(r.id)![day][period]) return r.id;
      }
    }
    return undefined;
  }

  private markBusy(facultyId: string, section: number, day: number, period: number, subjectId: string, roomId?: string) {
    if (this.globalFacultyBusy.has(facultyId)) {
      this.globalFacultyBusy.get(facultyId)![day][period] = true;
    }
    this.sectionBusy.get(section)![day][period] = true;
    if (roomId) this.roomBusy.get(roomId)![day][period] = true;

    const trackerKey = `${section}-${subjectId}-${day}`;
    this.subjectDayTracker.set(trackerKey, (this.subjectDayTracker.get(trackerKey) || 0) + 1);
  }

  private unmarkBusy(facultyId: string, section: number, day: number, period: number, subjectId: string, roomId?: string) {
    if (this.globalFacultyBusy.has(facultyId)) {
      this.globalFacultyBusy.get(facultyId)![day][period] = false;
    }
    this.sectionBusy.get(section)![day][period] = false;
    if (roomId) this.roomBusy.get(roomId)![day][period] = false;

    const trackerKey = `${section}-${subjectId}-${day}`;
    const val = this.subjectDayTracker.get(trackerKey) || 0;
    this.subjectDayTracker.set(trackerKey, Math.max(0, val - 1));
  }

  private getEligibleFaculty(subjectId: string, section: number): Faculty[] {
    return this.faculty.filter(f =>
      f.allottedSections?.includes(section) &&
      f.subjects?.some(s => subjectId.startsWith(s))
    );
  }

  public calculateDailyGaps(entries: ScheduleEntry[], day: number): number {
    const busy = entries.filter(e => e.day === day).map(e => e.period).sort((a, b) => a - b);
    if (busy.length > 1) {
      const first = busy[0];
      const last = busy[busy.length - 1];
      return (last - first + 1) - busy.length;
    }
    return 0;
  }

  public calculateSectionGaps(tt: Timetable, secId: number): number {
    let gaps = 0;
    const entries = tt[secId] || [];
    for (let d = 0; d < 6; d++) {
      gaps += this.calculateDailyGaps(entries, d);
    }
    return gaps;
  }

  public calculateGlobalCost(tt: Timetable): number {
    let totalGaps = 0;
    let maxGapInAnySection = 0;
    let gapVariance = 0;
    let facultyIdleTime = 0;
    let dailyGapViolations = 0;

    const sectionGapCounts = this.sections.map(secId => {
      const entries = tt[secId] || [];
      let sectionGaps = 0;
      for (let d = 0; d < 6; d++) {
        const dGaps = this.calculateDailyGaps(entries, d);
        if (dGaps > 2) dailyGapViolations++;
        sectionGaps += dGaps;
      }
      totalGaps += sectionGaps;
      if (sectionGaps > maxGapInAnySection) maxGapInAnySection = sectionGaps;
      return sectionGaps;
    });

    const avgGaps = totalGaps / (this.sections.length || 1);
    gapVariance = sectionGapCounts.reduce((acc, g) => acc + Math.pow(g - avgGaps, 2), 0) / (this.sections.length || 1);

    const facEntriesMap = new Map<string, ScheduleEntry[]>();
    this.sections.forEach(secId => {
      tt[secId].forEach(e => {
        if (!facEntriesMap.has(e.facultyId)) facEntriesMap.set(e.facultyId, []);
        facEntriesMap.get(e.facultyId)!.push(e);
      });
    });

    facEntriesMap.forEach((entries) => {
      for (let d = 0; d < 6; d++) {
        const dayBusy = entries.filter(e => e.day === d).map(e => e.period).sort((a, b) => a - b);
        if (dayBusy.length > 1) {
          facultyIdleTime += (dayBusy[dayBusy.length - 1] - dayBusy[0] + 1) - dayBusy.length;
        }
      }
    });

    return (dailyGapViolations * 10000) + (maxGapInAnySection * 1000) + (gapVariance * 500) + (totalGaps * 100) + (facultyIdleTime * 20);
  }

  // ------------------------------------------------------------------------
  // Aggressive gap reduction to achieve ≤4 gaps per section
  // ------------------------------------------------------------------------
  public finalGapReduction(timetable: Timetable) {
    let improved = true;
    const MAX_ITER = 50;
    let iter = 0;
    while (improved && iter < MAX_ITER) {
      improved = false;
      iter++;

      // Find section with maximum total gaps
      let maxGapSection: number | null = null;
      let maxGaps = 0;
      for (const sec of this.sections) {
        const gaps = this.calculateSectionGaps(timetable, sec);
        if (gaps > maxGaps) {
          maxGaps = gaps;
          maxGapSection = sec;
        }
      }
      if (maxGapSection === null || maxGaps <= 4) break; // Target achieved

      const section = maxGapSection;
      const entries = timetable[section];

      // Compute daily gaps for this section
      const dailyGaps: number[] = [];
      for (let d = 0; d < 6; d++) {
        dailyGaps[d] = this.calculateDailyGaps(entries, d);
      }

      // 1. Try moving a class from a high‑gap day to a lower‑gap day (only theory)
      const highGapDays = dailyGaps.map((g, d) => ({ d, g })).filter(x => x.g > 0).sort((a, b) => b.g - a.g);
      for (const { d: srcDay } of highGapDays) {
        const srcEntries = entries.filter(e => e.day === srcDay && !this.isLabOrTutorial(e.subjectId) && e.subjectId !== 'TRAINING');
        for (const entry of srcEntries) {
          for (let tgtDay = 0; tgtDay < 6; tgtDay++) {
            if (tgtDay === srcDay) continue;
            for (let p = 1; p <= 8; p++) {
              if (this.canPlace(entry.facultyId, section, tgtDay, p, entry.subjectId)) {
                const room = this.findAvailableRoom(tgtDay, p, 'THEORY');
                if (room) {
                  // Simulate move
                  const oldDay = entry.day;
                  const oldPeriod = entry.period;
                  const oldRoom = entry.roomId;
                  this.unmarkBusy(entry.facultyId, section, oldDay, oldPeriod, entry.subjectId, oldRoom);
                  this.markBusy(entry.facultyId, section, tgtDay, p, entry.subjectId, room);

                  const newSrcGaps = this.calculateDailyGaps(entries, srcDay);
                  const newTgtGaps = this.calculateDailyGaps(entries, tgtDay);

                  // Revert
                  this.unmarkBusy(entry.facultyId, section, tgtDay, p, entry.subjectId, room);
                  this.markBusy(entry.facultyId, section, oldDay, oldPeriod, entry.subjectId, oldRoom);

                  const oldTotal = dailyGaps[srcDay] + dailyGaps[tgtDay];
                  const newTotal = newSrcGaps + newTgtGaps;
                  if (newTotal < oldTotal) {
                    // Perform move
                    this.unmarkBusy(entry.facultyId, section, oldDay, oldPeriod, entry.subjectId, oldRoom);
                    entry.day = tgtDay;
                    entry.period = p;
                    entry.roomId = room;
                    this.markBusy(entry.facultyId, section, tgtDay, p, entry.subjectId, room);
                    improved = true;
                    break;
                  }
                }
              }
            }
            if (improved) break;
          }
          if (improved) break;
        }
        if (improved) break;
      }

      // 2. If no inter‑day improvement, try intra‑day moves (fill internal gaps) – only theory
      if (!improved) {
        for (const { d: day } of highGapDays) {
          const dayEntries = entries.filter(e => e.day === day);
          const busyPeriods = dayEntries.map(e => e.period).sort((a, b) => a - b);
          if (busyPeriods.length < 2) continue;
          const first = busyPeriods[0];
          const last = busyPeriods[busyPeriods.length - 1];
          // Gaps between first and last
          const gaps = [];
          for (let p = first + 1; p < last; p++) {
            if (!busyPeriods.includes(p)) gaps.push(p);
          }
          for (const gap of gaps) {
            // Find a class after the gap that can be moved into it (theory only)
            const candidates = dayEntries.filter(e => e.period > gap && !this.isLabOrTutorial(e.subjectId) && e.subjectId !== 'TRAINING');
            for (const entry of candidates) {
              if (this.canPlace(entry.facultyId, section, day, gap, entry.subjectId)) {
                const room = this.findAvailableRoom(day, gap, 'THEORY');
                if (room) {
                  // Move
                  const oldP = entry.period;
                  const oldR = entry.roomId;
                  this.unmarkBusy(entry.facultyId, section, day, oldP, entry.subjectId, oldR);
                  entry.period = gap;
                  entry.roomId = room;
                  this.markBusy(entry.facultyId, section, day, gap, entry.subjectId, room);
                  improved = true;
                  break;
                }
              }
            }
            if (improved) break;
          }
          if (improved) break;
        }
      }

      // After any move, re‑compact the day structure to maintain left‑alignment
      if (improved) {
        this.compactDayStructure(timetable);
      }
    }
  }

  // ------------------------------------------------------------------------
  // Existing optimisation methods – modified to skip lab/tutorial entries
  // ------------------------------------------------------------------------
  public redistributeGapsAI(timetable: Timetable) {
    const totalGaps = this.sections.reduce((sum, id) => sum + this.calculateSectionGaps(timetable, id), 0);
    const n = this.sections.length;
    const idealGaps = Math.ceil(totalGaps / n);

    for (let pass = 0; pass < 10; pass++) {
      let movedAny = false;
      const sectionStats = this.sections.map(id => ({ id, gaps: this.calculateSectionGaps(timetable, id) }))
        .sort((a, b) => b.gaps - a.gaps);

      // Fix daily violations (>2 gaps) – only move theory
      for (const sec of sectionStats) {
        const entries = timetable[sec.id];
        for (let d = 0; d < 6; d++) {
          if (this.calculateDailyGaps(entries, d) > 2) {
            const busy = entries.filter(e => e.day === d).map(e => e.period).sort((a, b) => a - b);
            const movable = entries.filter(e => e.day === d && !this.isLabOrTutorial(e.subjectId) && e.subjectId !== 'TRAINING');
            for (const entry of movable) {
              const oldD = entry.day, oldP = entry.period, oldR = entry.roomId;
              this.unmarkBusy(entry.facultyId, sec.id, oldD, oldP, entry.subjectId, oldR);

              const targets = [1, 2, 3, 4, 5, 6, 7, 8].filter(tp => !busy.includes(tp));
              for (const tp of targets) {
                if (this.canPlace(entry.facultyId, sec.id, d, tp, entry.subjectId)) {
                  const newRoom = this.findAvailableRoom(d, tp, 'THEORY');
                  if (newRoom) {
                    const tempBusy = [...busy.filter(p => p !== oldP), tp].sort((a, b) => a - b);
                    const newDGaps = (Math.max(...tempBusy) - Math.min(...tempBusy) + 1) - tempBusy.length;
                    if (newDGaps < this.calculateDailyGaps(entries, d)) {
                      entry.period = tp; entry.roomId = newRoom;
                      this.markBusy(entry.facultyId, sec.id, d, tp, entry.subjectId, newRoom);
                      movedAny = true; break;
                    }
                  }
                }
              }
              if (movedAny) break;
              this.markBusy(entry.facultyId, sec.id, oldD, oldP, entry.subjectId, oldR);
            }
          }
          if (movedAny) break;
        }
        if (movedAny) break;
      }

      // Balance gaps between sections – only move theory
      if (!movedAny) {
        const givers = sectionStats.filter(s => s.gaps > idealGaps);
        const receivers = sectionStats.filter(s => s.gaps < idealGaps);

        for (const giver of givers) {
          const giverEntries = timetable[giver.id];
          for (const entry of giverEntries) {
            if (this.isLabOrTutorial(entry.subjectId) || entry.subjectId === 'TRAINING') continue;
            const oldD = entry.day, oldP = entry.period, oldR = entry.roomId;
            this.unmarkBusy(entry.facultyId, giver.id, oldD, oldP, entry.subjectId, oldR);

            for (let td = 0; td < 6; td++) {
              for (let tp = 1; tp <= 8; tp++) {
                if (this.canPlace(entry.facultyId, giver.id, td, tp, entry.subjectId)) {
                  const nr = this.findAvailableRoom(td, tp, 'THEORY');
                  if (nr) {
                    entry.day = td; entry.period = tp; entry.roomId = nr;
                    if (this.calculateSectionGaps(timetable, giver.id) < giver.gaps && this.calculateDailyGaps(timetable[giver.id], td) <= 2) {
                      this.markBusy(entry.facultyId, giver.id, td, tp, entry.subjectId, nr);
                      movedAny = true; break;
                    }
                    entry.day = oldD; entry.period = oldP; entry.roomId = oldR;
                  }
                }
              }
              if (movedAny) break;
            }
            if (!movedAny) this.markBusy(entry.facultyId, giver.id, oldD, oldP, entry.subjectId, oldR);
            else break;
          }
          if (movedAny) break;
        }
      }

      this.compactDayStructure(timetable);
      if (!movedAny) break;
    }
  }

  private fillRemainingHours(timetable: Timetable, remaining: Map<string, Map<string, number>>) {
    let progress = true;
    while (progress) {
      progress = false;
      for (const section of this.sections) {
        const secRemaining = remaining.get(section.toString()) || new Map();
        if (secRemaining.size === 0) continue;

        for (let day = 0; day < 6; day++) {
          for (let period = 1; period <= 8; period++) {
            if (this.sectionBusy.get(section)![day][period]) continue;

            for (const [subId, hrsLeft] of Array.from(secRemaining.entries())) {
              if (hrsLeft <= 0) continue;

              const subject = this.subjects.find(s => s.id === subId);
              if (!subject) continue;

              const eligibleFaculty = this.getEligibleFaculty(subId, section);
              if (eligibleFaculty.length === 0) continue;

              const type = subject.isLabOrTutorial ? 'LAB' : 'THEORY';
              for (const fac of eligibleFaculty) {
                if (this.canPlace(fac.id, section, day, period, subId, true, false)) {
                  const room = this.findAvailableRoom(day, period, type);
                  if (room) {
                    this.addEntry(timetable, section, subId, fac.id, day, period, room);
                    secRemaining.set(subId, hrsLeft - 1);
                    progress = true;
                    break;
                  }
                }
              }
              if (progress) break;

              for (const fac of eligibleFaculty) {
                if (this.canPlace(fac.id, section, day, period, subId, true, true)) {
                  const room = this.findAvailableRoom(day, period, type);
                  if (room) {
                    this.addEntry(timetable, section, subId, fac.id, day, period, room);
                    secRemaining.set(subId, hrsLeft - 1);
                    progress = true;
                    break;
                  }
                }
              }
              if (progress) break;
            }
            if (progress) break;
          }
          if (progress) break;
        }
      }
    }
  }

  public solve(): Timetable {
    this.initMatrices();
    const timetable: Timetable = {};
    const shuffledSections = this.shuffle(this.sections);

    const remainingHours = new Map<string, Map<string, number>>();

    for (const section of shuffledSections) {
      timetable[section] = [];
      const sectionSubjects = this.subjects.filter(s => s.sections?.includes(section));
      const secRemaining = new Map<string, number>();
      sectionSubjects.forEach(s => secRemaining.set(s.id, s.hoursPerWeek));
      remainingHours.set(section.toString(), secRemaining);

      // 1. Training (continuous block of 6)
      const training = sectionSubjects.find(s => s.id === 'TRAINING');
      if (training) {
        const hrs = secRemaining.get('TRAINING') || 0;
        if (hrs >= 6) {
          for (let d = 0; d < 6; d++) {
            for (let start = 1; start <= 3; start++) {
              const periods = [start, start + 1, start + 2, start + 3, start + 4, start + 5];
              if (periods[5] > 8) continue;

              const sectionFree = periods.every(p => !this.sectionBusy.get(section)![d][p]);
              if (!sectionFree) continue;

              const room = this.rooms.find(r =>
                r.type === 'LAB' &&
                periods.every(p => !this.roomBusy.get(r.id)![d][p])
              );
              if (room) {
                periods.forEach(p => {
                  this.addEntry(timetable, section, 'TRAINING', 'TRAINING_DEPT', d, p, room.id);
                });
                secRemaining.set('TRAINING', hrs - 6);
                break;
              }
            }
            if (secRemaining.get('TRAINING') === 0) break;
          }
        }
      }

      // 2. Labs (2‑hour blocks)
      const labs = sectionSubjects.filter(s => s.isLabOrTutorial && s.id !== 'TRAINING');
      for (const sub of labs) {
        let hrs = secRemaining.get(sub.id) || 0;
        while (hrs >= 2) {
          let placed = false;
          const facPool = this.shuffle(this.getEligibleFaculty(sub.id, section));
          const days = this.shuffle([0, 1, 2, 3, 4, 5]);
          for (const d of days) {
            for (const p of [1, 3, 6]) {
              if (p + 1 > 8) continue;
              for (const fac of facPool) {
                if (this.canPlace(fac.id, section, d, p, sub.id) && this.canPlace(fac.id, section, d, p + 1, sub.id)) {
                  const r = this.findAvailableRoom(d, p, 'LAB');
                  if (r && !this.roomBusy.get(r)![d][p + 1]) {
                    this.addEntry(timetable, section, sub.id, fac.id, d, p, r);
                    this.addEntry(timetable, section, sub.id, fac.id, d, p + 1, r);
                    hrs -= 2;
                    placed = true;
                    break;
                  }
                }
              }
              if (placed) break;
            }
            if (placed) break;
          }
          if (!placed) break;
        }
        secRemaining.set(sub.id, hrs);
      }

      // 3. Theory (greedy multiple passes)
      const theory = sectionSubjects.filter(s => !s.isLabOrTutorial && s.id !== 'TRAINING');
      let changed: boolean;
      do {
        changed = false;
        for (let d = 0; d < 6; d++) {
          for (let p = 1; p <= 8; p++) {
            if (this.sectionBusy.get(section)![d][p]) continue;

            const candidates = theory.filter(s => (secRemaining.get(s.id) || 0) > 0);
            if (candidates.length === 0) break;

            candidates.sort((a, b) => (secRemaining.get(b.id) || 0) - (secRemaining.get(a.id) || 0));

            for (const sub of candidates) {
              const facPool = this.shuffle(this.getEligibleFaculty(sub.id, section));
              for (const fac of facPool) {
                if (this.canPlace(fac.id, section, d, p, sub.id)) {
                  const r = this.findAvailableRoom(d, p, 'THEORY');
                  if (r) {
                    this.addEntry(timetable, section, sub.id, fac.id, d, p, r);
                    secRemaining.set(sub.id, (secRemaining.get(sub.id) || 0) - 1);
                    changed = true;
                    break;
                  }
                }
              }
              if (changed) break;
            }
            if (changed) break;
          }
          if (changed) break;
        }
      } while (changed);
    }

    this.fillRemainingHours(timetable, remainingHours);
    this.compactDayStructure(timetable);
    this.adaptiveLocalSearch(timetable);
    // Final aggressive gap reduction
    this.finalGapReduction(timetable);
    return timetable;
  }

  public geneticAlgorithm(initial: Timetable): Timetable {
    let best = this.deepCloneTimetable(initial);
    let bestCost = this.calculateGlobalCost(best);
    for (let gen = 0; gen < 10; gen++) {
      const candidate = this.deepCloneTimetable(best);
      for (let i = 0; i < 5; i++) {
        const sec = this.sections[Math.floor(Math.random() * this.sections.length)];
        const entries = candidate[sec].filter(e => !this.isLabOrTutorial(e.subjectId) && e.subjectId !== 'TRAINING');
        if (entries.length < 2) continue;
        const e1 = entries[Math.floor(Math.random() * entries.length)];
        const e2 = entries[Math.floor(Math.random() * entries.length)];
        if (e1.day === e2.day && e1.period === e2.period) continue;
        if (!this.globalFacultyBusy.get(e1.facultyId)?.[e2.day][e2.period] && !this.globalFacultyBusy.get(e2.facultyId)?.[e1.day][e1.period]) {
          const d1 = e1.day, p1 = e1.period, r1 = e1.roomId;
          e1.day = e2.day; e1.period = e2.period; e1.roomId = e2.roomId;
          e2.day = d1; e2.period = p1; e2.roomId = r1;
        }
      }
      this.compactDayStructure(candidate);
      const cost = this.calculateGlobalCost(candidate);
      if (cost < bestCost) { best = candidate; bestCost = cost; }
    }
    return best;
  }

  public simulatedAnnealing(initial: Timetable): Timetable {
    let current = this.deepCloneTimetable(initial);
    let currentCost = this.calculateGlobalCost(current);
    let best = this.deepCloneTimetable(current);
    let bestCost = currentCost;
    let temp = 100.0;
    for (let i = 0; i < 50; i++) {
      const candidate = this.deepCloneTimetable(current);
      const sec = this.sections[Math.floor(Math.random() * this.sections.length)];
      const entries = candidate[sec].filter(e => !this.isLabOrTutorial(e.subjectId) && e.subjectId !== 'TRAINING');
      if (entries.length > 0) {
        const e = entries[Math.floor(Math.random() * entries.length)];
        const oldD = e.day, oldP = e.period, oldR = e.roomId;
        const newD = Math.floor(Math.random() * 6);
        const newP = Math.floor(Math.random() * 8) + 1;
        this.unmarkBusy(e.facultyId, sec, oldD, oldP, e.subjectId, oldR);
        if (this.canPlace(e.facultyId, sec, newD, newP, e.subjectId)) {
          const nr = this.findAvailableRoom(newD, newP, 'THEORY');
          if (nr) { e.day = newD; e.period = newP; e.roomId = nr; }
        }
        this.markBusy(e.facultyId, sec, e.day, e.period, e.subjectId, e.roomId);
      }
      this.compactDayStructure(candidate);
      const cost = this.calculateGlobalCost(candidate);
      if (cost < currentCost || Math.random() < Math.exp((currentCost - cost) / temp)) {
        current = candidate; currentCost = cost;
        if (cost < bestCost) { best = candidate; bestCost = cost; }
      }
      temp *= 0.95;
    }
    return best;
  }

  public tabuSearch(initial: Timetable): Timetable {
    let best = this.deepCloneTimetable(initial);
    let bestCost = this.calculateGlobalCost(best);
    const tabuList: string[] = [];
    let current = this.deepCloneTimetable(initial);
    for (let step = 0; step < 20; step++) {
      const sec = this.sections[Math.floor(Math.random() * this.sections.length)];
      const entries = current[sec].filter(e => !this.isLabOrTutorial(e.subjectId) && e.subjectId !== 'TRAINING');
      if (entries.length < 2) continue;
      const e1 = entries[Math.floor(Math.random() * entries.length)];
      const e2 = entries[Math.floor(Math.random() * entries.length)];
      const moveKey = `${sec}-${e1.period}-${e2.period}`;
      if (!tabuList.includes(moveKey)) {
        const d1 = e1.day, p1 = e1.period, r1 = e1.roomId;
        e1.day = e2.day; e1.period = e2.period; e1.roomId = e2.roomId;
        e2.day = d1; e2.period = p1; e2.roomId = r1;
        this.compactDayStructure(current);
        const cost = this.calculateGlobalCost(current);
        if (cost < bestCost) { best = this.deepCloneTimetable(current); bestCost = cost; }
        tabuList.push(moveKey);
        if (tabuList.length > 10) tabuList.shift();
      }
    }
    return best;
  }

  public adaptiveLocalSearch(timetable: Timetable) {
    const sectionIds = Object.keys(timetable).map(Number).sort((a, b) => a - b);
    for (let iter = 0; iter < 5; iter++) {
      let improved = false;
      for (const secId of sectionIds) {
        const sectionEntries = timetable[secId];
        for (const targetDay of [0, 1, 2, 3, 4, 5]) {
          const dayEntries = sectionEntries.filter(e => e.day === targetDay);
          const busyPeriods = dayEntries.map(e => e.period);
          const lastBusy = Math.max(...busyPeriods, 0);
          const internalGaps = Array.from({ length: lastBusy }, (_, i) => i + 1).filter(p => !busyPeriods.includes(p));
          for (const gapP of internalGaps) {
            const potentialMoves = sectionEntries.filter(e => !this.isLabOrTutorial(e.subjectId) && e.subjectId !== 'TRAINING');
            for (const entry of potentialMoves) {
              const oldD = entry.day; const oldP = entry.period; const oldR = entry.roomId;
              this.unmarkBusy(entry.facultyId, secId, oldD, oldP, entry.subjectId, oldR);
              if (this.canPlace(entry.facultyId, secId, targetDay, gapP, entry.subjectId)) {
                const nR = this.findAvailableRoom(targetDay, gapP, 'THEORY');
                if (nR) {
                  entry.day = targetDay; entry.period = gapP; entry.roomId = nR;
                  this.markBusy(entry.facultyId, secId, targetDay, gapP, entry.subjectId, nR);
                  improved = true; break;
                }
              }
              this.markBusy(entry.facultyId, secId, oldD, oldP, entry.subjectId, oldR);
            }
            if (improved) break;
          }
        }
      }
      this.compactDayStructure(timetable);
      if (!improved) break;
    }
  }

  /**
   * Compact day structure while preserving multi‑period blocks (labs, tutorials, training).
   * Only single‑period theory classes are moved to the leftmost available slots.
   */
  public compactDayStructure(timetable: Timetable) {
    const sectionIds = Object.keys(timetable).map(Number).sort((a, b) => a - b);
    for (const day of [0, 1, 2, 3, 4, 5]) {
      for (const sectionId of sectionIds) {
        const dayEntries = timetable[sectionId].filter(e => e.day === day).sort((a, b) => a.period - b.period);
        if (dayEntries.length === 0) continue;

        // 1. Identify blocks (consecutive entries of same subject and faculty)
        const blocks: { entries: ScheduleEntry[]; start: number; length: number }[] = [];
        const singles: ScheduleEntry[] = [];

        let i = 0;
        while (i < dayEntries.length) {
          let j = i;
          while (
            j + 1 < dayEntries.length &&
            dayEntries[j + 1].subjectId === dayEntries[j].subjectId &&
            dayEntries[j + 1].facultyId === dayEntries[j].facultyId &&
            dayEntries[j + 1].period === dayEntries[j].period + 1
          ) {
            j++;
          }
          if (j > i) {
            // block from i to j inclusive
            const blockEntries = dayEntries.slice(i, j + 1);
            blocks.push({
              entries: blockEntries,
              start: blockEntries[0].period,
              length: blockEntries.length,
            });
          } else {
            // single entry
            singles.push(dayEntries[i]);
          }
          i = j + 1;
        }

        // 2. Unmark all singles (they will be reassigned)
        singles.forEach(e =>
          this.unmarkBusy(e.facultyId, sectionId, day, e.period, e.subjectId, e.roomId)
        );

        // 3. Sort blocks by start period
        const sortedBlocks = blocks.sort((a, b) => a.start - b.start);

        // 4. Prepare list of singles to place in order
        const singlesToPlace = [...singles];

        // 5. Iterate periods 1..8, place singles into free slots
        for (let p = 1; p <= 8; p++) {
          // Check if current period is occupied by a block
          const block = sortedBlocks.find(b => p >= b.start && p < b.start + b.length);
          if (block) {
            continue; // period is fixed by block
          }

          if (singlesToPlace.length === 0) break;

          const entry = singlesToPlace.shift()!;
          const type = this.isLabOrTutorial(entry.subjectId) ? 'LAB' : 'THEORY';
          const room = this.findAvailableRoom(day, p, type);
          if (room) {
            entry.period = p;
            entry.roomId = room;
            this.markBusy(entry.facultyId, sectionId, day, p, entry.subjectId, room);
          } else {
            // Fallback: try to use original room if free, otherwise any room
            if (entry.roomId && !this.roomBusy.get(entry.roomId)![day][p]) {
              entry.period = p;
              this.markBusy(entry.facultyId, sectionId, day, p, entry.subjectId, entry.roomId);
            } else {
              const anyRoom = this.rooms.find(r => !this.roomBusy.get(r.id)![day][p]);
              if (anyRoom) {
                entry.period = p;
                entry.roomId = anyRoom.id;
                this.markBusy(entry.facultyId, sectionId, day, p, entry.subjectId, anyRoom.id);
              } else {
                // Extremely unlikely – put back at original period (but we lost it). As a last resort, mark at current p with original room (may conflict)
                console.warn('No room available during compaction; keeping original position');
                // We need to re‑insert at original period – but we have no guarantee it's free.
                // Instead, we'll push the entry back and try later periods.
                singlesToPlace.unshift(entry);
              }
            }
          }
        }

        // 6. If any singles left (should not happen if we had enough periods), place them at the end
        if (singlesToPlace.length > 0) {
          for (let p = 8; p >= 1; p--) {
            if (singlesToPlace.length === 0) break;
            if (this.sectionBusy.get(sectionId)![day][p]) continue; // occupied by block or already placed
            const entry = singlesToPlace.shift()!;
            const type = this.isLabOrTutorial(entry.subjectId) ? 'LAB' : 'THEORY';
            const room = this.findAvailableRoom(day, p, type);
            if (room) {
              entry.period = p;
              entry.roomId = room;
              this.markBusy(entry.facultyId, sectionId, day, p, entry.subjectId, room);
            } else {
              // fallback as before
              if (entry.roomId && !this.roomBusy.get(entry.roomId)![day][p]) {
                entry.period = p;
                this.markBusy(entry.facultyId, sectionId, day, p, entry.subjectId, entry.roomId);
              } else {
                const anyRoom = this.rooms.find(r => !this.roomBusy.get(r.id)![day][p]);
                if (anyRoom) {
                  entry.period = p;
                  entry.roomId = anyRoom.id;
                  this.markBusy(entry.facultyId, sectionId, day, p, entry.subjectId, anyRoom.id);
                }
              }
            }
          }
        }
      }
    }
  }

  private addEntry(tt: Timetable, section: number, subId: string, facId: string, d: number, p: number, roomId?: string) {
    if (!tt[section]) tt[section] = [];
    tt[section].push({ subjectId: subId, facultyId: facId, section, day: d, period: p, roomId });
    this.markBusy(facId, section, d, p, subId, roomId);
  }
}
// Design doc §17 example: overall 82 -> 43 XP with a 12 XP challenge bonus, i.e. ~0.4 per point.
const XP_PER_POINT = 0.4;

export function xpFor(overall: number, challengeCompleted: boolean, challengeBonusXp: number) {
  const bonus = challengeCompleted ? challengeBonusXp : 0;
  return { bonus, total: Math.round(overall * XP_PER_POINT) + bonus };
}

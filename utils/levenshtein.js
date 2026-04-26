function levenshteinDistance(s1, s2) {
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  let prevRow = Array.from(
    { length: len2 + 1 }, (_, i) => i
  );
  let currentRow = new Array(len2 + 1);

  for (let i = 0; i < len1; i++) {
    currentRow[0] = i + 1;
    for (let j = 0; j < len2; j++) {
      const cost = s1[i] === s2[j] ? 0 : 1;
      currentRow[j + 1] = Math.min(
        currentRow[j] + 1,
        prevRow[j + 1] + 1,
        prevRow[j] + cost
      );
    }
    prevRow = [...currentRow];
  }
  return prevRow[len2];
}

function validateTypeAnswer(
  playerAnswer, 
  acceptedAnswers, 
  useFuzzy = true, 
  tolerance = 2
) {
  const normalize = (str) => 
    str.toLowerCase().trim().replace(/\s+/g, ' ')
       .replace(/[^\w\s]/g, '');

  const normalizedInput = normalize(playerAnswer);
  let minDistance = Infinity;

  for (const ans of acceptedAnswers) {
    const normalizedTarget = normalize(ans);

    if (normalizedInput === normalizedTarget) {
      return { 
        isCorrect: true, 
        matchType: 'exact', 
        distance: 0 
      };
    }

    if (useFuzzy) {
      const dist = levenshteinDistance(
        normalizedInput, normalizedTarget
      );
      if (dist < minDistance) minDistance = dist;
    }
  }

  if (useFuzzy && minDistance <= tolerance) {
    return { 
      isCorrect: true, 
      matchType: 'fuzzy', 
      distance: minDistance 
    };
  }

  return { 
    isCorrect: false, 
    matchType: 'none', 
    distance: minDistance 
  };
}

module.exports = { levenshteinDistance, validateTypeAnswer };

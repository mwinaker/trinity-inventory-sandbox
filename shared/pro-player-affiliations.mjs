const verifiedAt = '2026-07-19'

function affiliation(levelOfPlay, currentClub = '', mlbOrganization = '', note = '') {
  return { levelOfPlay, currentClub, mlbOrganization, affiliationVerifiedAt: verifiedAt, note }
}

export const proPlayerAffiliations = {
  'aaron schunk': affiliation('MILB', 'Gwinnett Stripers', 'Atlanta Braves'),
  'aaron zavala': affiliation('MILB', 'Round Rock Express', 'Texas Rangers'),
  'adam fogel': affiliation('MILB', 'Birmingham Barons', 'Chicago White Sox'),
  'alejandro angel lara': affiliation('Indy Ball', 'Yuba-Sutter High Wheelers'),
  'alika williams': affiliation('MLB', 'Athletics', 'Athletics'),
  'andrew jimenez': affiliation(
    'Amateur',
    'USA Baseball',
    '',
    'Existing profile is not currently tied to a professional club.',
  ),
  'andrew navigato': affiliation('MILB', 'Toledo Mud Hens', 'Detroit Tigers'),
  'andy yerzy': affiliation('MILB', 'Memphis Redbirds', 'St. Louis Cardinals'),
  'angel mendoza': affiliation('MILB', 'ACL Guardians', 'Cleveland Guardians'),
  'austin sargent': affiliation('Indy Ball', 'Austin Weirdos'),
  'blaine crim': affiliation(
    'Free Agent',
    '',
    '',
    'Released by the Texas Rangers on June 24, 2026.',
  ),
  'blake bowen': affiliation(
    'Drafted - unsigned',
    'JSerra Catholic High School',
    'Colorado Rockies',
    'Selected by Colorado in the 2026 MLB Draft; not yet listed on an affiliated roster.',
  ),
  'blake sabol': affiliation('MILB', 'Durham Bulls', 'Tampa Bay Rays'),
  'brandon compton': affiliation('MILB', 'Pensacola Blue Wahoos', 'Miami Marlins'),
  'brandon valenzuela': affiliation('MLB', 'Toronto Blue Jays', 'Toronto Blue Jays'),
  'brett baty': affiliation('MLB', 'New York Mets', 'New York Mets'),
  'caleb lomavita': affiliation('MILB', 'Harrisburg Senators', 'Washington Nationals'),
  'caleb mcneely': affiliation('Indy Ball', 'Cleburne Railroaders'),
  'corey seager': affiliation('MLB', 'Texas Rangers', 'Texas Rangers'),
  'dallas macias': affiliation('MILB', 'Rome Emperors', 'Atlanta Braves'),
  'damon keith': affiliation('MILB', 'Biloxi Shuckers', 'Milwaukee Brewers'),
  'delano selassa': affiliation(
    'Honkbal Hoofdklasse',
    'HCAW / Kingdom of the Netherlands',
  ),
  'drew millas': affiliation('MLB', 'Washington Nationals', 'Washington Nationals'),
  'dylan beavers': affiliation('MLB', 'Baltimore Orioles', 'Baltimore Orioles'),
  'dylan leek': affiliation('Indy Ball', 'Dublin Leprechauns'),
  'eli pitts': affiliation('MILB', 'ACL Reds', 'Cincinnati Reds'),
  'emilio corona': affiliation('Indy Ball', 'Long Beach Coast'),
  'eric bitonti': affiliation('MILB', 'Wisconsin Timber Rattlers', 'Milwaukee Brewers'),
  'ethan holliday': affiliation('MILB', 'Fresno Grizzlies', 'Colorado Rockies'),
  'greg jones': affiliation('MILB', 'Nashville Sounds', 'Milwaukee Brewers'),
  'harry ford': affiliation('MLB', 'Washington Nationals', 'Washington Nationals'),
  'jack leeper': affiliation(
    'Amateur',
    'St. Francis High School',
    '',
    '2027 MLB Draft prospect committed to Stanford; not currently a professional player.',
  ),
  'jacob klinovsky': affiliation('Indy Ball', 'Martinez Sturgeon'),
  'jacob sharp': affiliation('MILB', 'Vancouver Canadians', 'Toronto Blue Jays'),
  'jakob christian': affiliation('MILB', 'Eugene Emeralds', 'San Francisco Giants'),
  'jackson holliday': affiliation('MLB', 'Baltimore Orioles', 'Baltimore Orioles'),
  'jeremiah jackson': affiliation('MLB', 'Baltimore Orioles', 'Baltimore Orioles'),
  'jimmy obertop': affiliation('MILB', 'Hartford Yard Goats', 'Colorado Rockies'),
  'joey bart': affiliation('MLB', 'Atlanta Braves', 'Atlanta Braves'),
  'jordan westburg': affiliation('MLB', 'Baltimore Orioles', 'Baltimore Orioles'),
  'josh lester': affiliation('Mexican League', 'Sultanes de Monterrey'),
  'kellen strahm': affiliation('Mexican League', 'Sultanes de Monterrey'),
  'korey lee': affiliation('MILB', 'Charlotte Knights', 'Chicago White Sox'),
  'luke cantwell': affiliation('MILB', 'Fort Wayne TinCaps', 'San Diego Padres'),
  'marcus chiu': affiliation('Indy Ball', 'Long Island Ducks'),
  'michael chavis': affiliation('MILB', 'Louisville Bats', 'Cincinnati Reds'),
  'michael massey': affiliation('MLB', 'Kansas City Royals', 'Kansas City Royals'),
  'michael toglia': affiliation('MILB', 'Louisville Bats', 'Cincinnati Reds'),
  'nick peoples': affiliation('MILB', 'Fredericksburg Nationals', 'Washington Nationals'),
  'nick pratto': affiliation('MILB', 'El Paso Chihuahuas', 'San Diego Padres'),
  'phillip glasser': affiliation('MILB', 'Rochester Red Wings', 'Washington Nationals'),
  'rio ruiz': affiliation('Mexican League', 'Diablos Rojos del Mexico'),
  'sharlon schoop': affiliation(
    'International - WBC/Honkbalweek',
    'Kingdom of the Netherlands',
    '',
    'Active on the 2026 World Baseball Classic and Haarlem Baseball Week national-team rosters.',
  ),
  'steven lancia': affiliation('MILB', 'Kannapolis Cannon Ballers', 'Chicago White Sox'),
  'tucker mitchell': affiliation('MILB', 'Frisco RoughRiders', 'Texas Rangers'),
  'vladimir guerrero': affiliation('MLB', 'Toronto Blue Jays', 'Toronto Blue Jays'),
  'will banfield': affiliation('MILB', 'Louisville Bats', 'Cincinnati Reds'),
  'will bermudez': affiliation(
    'Free Agent',
    '',
    '',
    'Most recently played for the Cleburne Railroaders in the American Association.',
  ),
  'will decker': affiliation(
    'Free Agent',
    '',
    '',
    'Most recently played in independent professional baseball.',
  ),
  'yohel pozo': affiliation('MLB', 'St. Louis Cardinals', 'St. Louis Cardinals'),
  'zac veen': affiliation('MILB', 'Albuquerque Isotopes', 'Colorado Rockies'),
}

export function normalizePlayerNameKey(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function getKnownProPlayerAffiliation(playerName) {
  return proPlayerAffiliations[normalizePlayerNameKey(playerName)] ?? null
}

export function parseManualBatOrderSegments(note, fallbackModel = 'Bat') {
  const text = String(note ?? '').trim()
  if (!text) return []

  const segments = []
  const pattern =
    /\((\d+)\)\s*(\d+(?:\.\d+)?)\s*(?:"|”|in)?\s*\/\s*(\d+(?:\.\d+)?)\s*(?:oz)?\s*([^()]*?)(?=\s*\(\d+\)|$)/gi
  for (const match of text.matchAll(pattern)) {
    const quantity = Number(match[1])
    const length = match[2]
    const weight = match[3]
    const details = match[4]
      .trim()
      .replace(/^[·•\-\s]+/, '')
      .replace(/\s*[·•]\s*/g, ' · ')
    const model = String(fallbackModel || 'Bat').trim() || 'Bat'

    segments.push({
      quantity,
      length,
      weight,
      model,
      details,
      summary: `${quantity} × ${length}\"/${weight} oz ${model}${details ? ` — ${details}` : ''}`,
    })
  }

  return segments
}

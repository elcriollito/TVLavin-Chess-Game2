/*
 * Deterministic circle-method scheduling for Engine Arena tournaments.
 */

(function () {
    function validateParticipants(participants) {
        if (!Array.isArray(participants) || participants.length < 2) {
            throw new Error('Arena tournament scheduling requires at least two participants.');
        }
        const ids = participants.map(participant => participant?.id);
        if (ids.some(id => typeof id !== 'string' || !id)
            || new Set(ids).size !== ids.length) {
            throw new Error('Arena tournament participants require unique provider IDs.');
        }
    }

    function rotate(seed, count) {
        const rotated = [...seed];
        for (let index = 0; index < count; index += 1) {
            rotated.splice(1, 0, rotated.pop());
        }
        return rotated;
    }

    function getRoundPairings(participants, roundNumber) {
        validateParticipants(participants);
        if (!Number.isInteger(roundNumber) || roundNumber < 0) {
            throw new Error('Arena tournament round must be a non-negative integer.');
        }

        const seed = [...participants];
        if (seed.length % 2 === 1) seed.push(null);
        const cycleLength = seed.length - 1;
        const roundInCycle = roundNumber % cycleLength;
        const reverseColors = Math.floor(roundNumber / cycleLength) % 2 === 1;
        const rotated = rotate(seed, roundInCycle);
        const pairings = [];

        for (let index = 0; index < rotated.length / 2; index += 1) {
            const left = rotated[index];
            const right = rotated[rotated.length - 1 - index];
            if (!left || !right) continue;

            let white = index === 0 && roundInCycle % 2 === 1 ? right : left;
            let black = white === left ? right : left;
            if (reverseColors) [white, black] = [black, white];
            pairings.push(Object.freeze({ white, black, round: roundNumber }));
        }

        return Object.freeze(pairings);
    }

    window.ArenaTournamentScheduler = Object.freeze({ getRoundPairings });
})();

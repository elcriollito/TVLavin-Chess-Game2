# PGN Library Structure

## Directory Organization

```
/pgn/
├── world-champions/
│   ├── Alekhine/
│   ├── Anand/
│   ├── Botvinnik/
│   ├── Capablanca/
│   ├── Carlsen/
│   ├── Euwe/
│   ├── Fischer/
│   ├── Karpov/
│   ├── Kasparov/
│   ├── Kramnik/
│   ├── Lasker/
│   ├── Petrosian/
│   ├── Smyslov/
│   ├── Spassky/
│   ├── Steinitz/
│   ├── Tal/
│   └── Topalov/
├── grandmasters/
│   ├── Anderssen/
│   ├── Bronstein/
│   ├── Grischuk/
│   ├── Ivanchuk/
│   ├── Keres/
│   ├── Morphy/
│   ├── Najdorf/
│   ├── Nimzowitsch/
│   ├── Polgar/
│   ├── Reshevsky/
│   ├── Rubinstein/
│   └── Tartakower/
├── demo/
│   └── (various demo games, tactics, examples)
├── library.json
└── STRUCTURE.md (this file)
```

## Naming Conventions

### File Names
- Format: `[player1]_vs_[player2]_[year].pgn`
- Examples:
  - `kasparov_vs_topalov_1999.pgn`
  - `fischer_vs_spassky_1972.pgn`
  - `morphy_vs_duke_1858.pgn`

### Folder Names
- Use player's last name only
- No special characters, no spaces
- Title case (e.g., `Kasparov`, not `kasparov`)
- Use original spelling where possible

## Categories

### World Champions (FIDE Official)
1. Wilhelm Steinitz (1886-1894)
2. Emanuel Lasker (1894-1921)
3. José Raúl Capablanca (1921-1927)
4. Alexander Alekhine (1927-1935, 1937-1946)
5. Max Euwe (1935-1937)
6. Mikhail Botvinnik (1948-1957, 1958-1960, 1961-1963)
7. Vasily Smyslov (1957-1958)
8. Mikhail Tal (1960-1961)
9. Tigran Petrosian (1963-1969)
10. Boris Spassky (1969-1972)
11. Bobby Fischer (1972-1975)
12. Anatoly Karpov (1975-1985)
13. Garry Kasparov (1985-2000)
14. Vladimir Kramnik (2000-2007)
15. Viswanathan Anand (2007-2013)
16. Magnus Carlsen (2013-2023)
17. Ding Liren (2023-present)

### Notable Grandmasters (Non-Champions)
- Paul Morphy (1837-1884) - Unofficial world champion
- Adolf Anderssen (1818-1879) - Considered best before Steinitz
- Akiba Rubinstein (1880-1961) - Nearly challenged for title
- Aaron Nimzowitsch (1886-1935) - Hypermodern pioneer
- Savielly Tartakower (1887-1956) - Hypermodern school
- Samuel Reshevsky (1911-1992) - Child prodigy
- David Bronstein (1924-2006) - Challenger 1951
- Paul Keres (1916-1975) - "The Crown Prince of Chess"
- Miguel Najdorf (1910-1997) - Najdorf Sicilian
- Vassily Ivanchuk (1969-present) - Super GM
- Alexander Grischuk (1983-present) - Top 10 player
- Judit Polgar (1976-present) - Strongest female player ever

## File Size Considerations

- Keep individual PGN files reasonable (< 5MB each)
- For prolific players, split by era or event type
- GitHub has a 100MB file limit
- Aim for 10-50 games per file for best performance

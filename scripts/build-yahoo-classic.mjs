import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../index.html', import.meta.url);
const outputPath = new URL('../yahoo-classic.html', import.meta.url);
const canonical = 'https://www.caissa-chess.org/yahoo-classic';
const title = 'Yahoo Chess Alternative — Classic Online Chess Rooms | CAISSA';
const description = 'Enter CAISSA Classic, an independent Yahoo Chess-inspired experience with social rooms, visible tables, challenges, spectating and a retro chess atmosphere.';
const image = 'https://www.caissa-chess.org/assets/blog/classic-online-chess-room-nostalgia.webp';

let html = await readFile(sourcePath, 'utf8');

html = html
  .replace('<title>CAISSA Chess – Play Online, Stockfish Analysis & Training</title>', `<title>${title}</title>`)
  .replace('<meta name="title" content="CAISSA Chess – Play Online, Stockfish Analysis & Training">', `<meta name="title" content="${title}">`)
  .replace(/<meta name="description" content="[^"]+">/, `<meta name="description" content="${description}">`)
  .replace('<link rel="canonical" href="https://www.caissa-chess.org/" />', `<link rel="canonical" href="${canonical}" />`)
  .replace('<meta property="og:type" content="website">', '<meta property="og:type" content="website">')
  .replace('<meta property="og:url" content="https://www.caissa-chess.org/">', `<meta property="og:url" content="${canonical}">`)
  .replace(/<meta property="og:title" content="[^"]+">/, `<meta property="og:title" content="${title}">`)
  .replace(/<meta property="og:description" content="[^"]+">/, `<meta property="og:description" content="${description}">`)
  .replace(/<meta property="og:image" content="[^"]+">/, `<meta property="og:image" content="${image}">`)
  .replace('<meta property="og:image:width" content="1200">', '<meta property="og:image:width" content="1440">')
  .replace('<meta property="og:image:height" content="630">', '<meta property="og:image:height" content="960">')
  .replace('<meta property="og:image:type" content="image/png">', '<meta property="og:image:type" content="image/webp">')
  .replace(/<meta property="og:image:alt" content="[^"]+">/, '<meta property="og:image:alt" content="An original retro online chess room illustration created for CAISSA Classic.">')
  .replace('<meta name="twitter:url" content="https://www.caissa-chess.org/">', `<meta name="twitter:url" content="${canonical}">`)
  .replace(/<meta name="twitter:title" content="[^"]+">/, `<meta name="twitter:title" content="${title}">`)
  .replace(/<meta name="twitter:description" content="[^"]+">/, `<meta name="twitter:description" content="${description}">`)
  .replace(/<meta name="twitter:image" content="[^"]+">/, `<meta name="twitter:image" content="${image}">`)
  .replace(/<meta name="twitter:image:alt" content="[^"]+">/, '<meta name="twitter:image:alt" content="An original retro online chess room illustration created for CAISSA Classic.">')
  .replace('<body>', '<body class="yc-standalone-page">')
  .replace('                                    <a class="yc-story-link" href="/blog/yahoo-chess-spirit-caissa-classic">Read the story behind CAISSA Classic</a>\n', '');

const schemaPattern = /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g;
html = html.replace(schemaPattern, '');

const schemas = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "${title}",
      "description": "${description}",
      "url": "${canonical}",
      "image": "${image}",
      "isPartOf": {
        "@type": "WebSite",
        "name": "CAISSA Chess",
        "url": "https://www.caissa-chess.org/"
      },
      "publisher": {
        "@type": "Organization",
        "name": "CAISSA Chess",
        "url": "https://www.caissa-chess.org/"
      }
    }
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://www.caissa-chess.org/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "CAISSA Classic",
          "item": "${canonical}"
        }
      ]
    }
    </script>
`;
html = html.replace(/(\s*<!-- Favicon and App Icons)/, `${schemas}\n$1`);

const landingContent = `
                <header class="yc-landing-intro">
                    <p class="yc-landing-kicker">Classic online chess rooms</p>
                    <h1>CAISSA Classic — A Yahoo Chess-Inspired Online Lobby</h1>
                    <p>CAISSA Classic is an independent online chess experience inspired by the room-based social atmosphere many players remember from Yahoo Chess. Enter the CAISSA Lobby, browse visible tables, create challenges, watch games, and explore a retro-style chess community built under the CAISSA Chess identity.</p>
                    <p class="yc-landing-disclaimer"><strong>CAISSA Chess is an independent project and is not affiliated with, sponsored by, or endorsed by Yahoo.</strong></p>
                </header>
`;
html = html.replace('                <div class="yc-shell" role="application"', `${landingContent}                <div class="yc-shell" role="application"`);

const supportingContent = `
                <div class="yc-landing-support">
                    <section aria-labelledby="ycSocialLobbyHeading">
                        <h2 id="ycSocialLobbyHeading">A Social Chess Lobby, Not Just a Pairing Button</h2>
                        <p>CAISSA Classic emphasizes the shared setting around a game. The room directory, visible tables, player activity, challenges, and spectator controls give players a sense of place before the first move. The CAISSA Lobby is the active public room, while the interface also presents dedicated spaces for tournaments, computer play, and teaching as clearly labelled parts of the Classic experience.</p>
                    </section>
                    <section aria-labelledby="ycClassicFeaturesHeading">
                        <h2 id="ycClassicFeaturesHeading">What You Can Do in CAISSA Classic</h2>
                        <p>Browse tables and game information, create a casual or rated table, choose a time control and color preference, and follow activity from the lobby workspace. Board controls, an activity feed, rating legend, challenge actions, spectator options, room navigation, and Classic sound controls remain together in the application. Features that are not yet active are identified in the interface instead of being presented as available.</p>
                    </section>
                    <section aria-labelledby="ycHistoryHeading">
                        <h2 id="ycHistoryHeading">Inspired by Online Chess History</h2>
                        <p>CAISSA preserves the social idea of room-based online chess while using its own identity, artwork, and implementation. It is not an official Yahoo product, clone, recreation, or continuation. <a href="/blog/yahoo-chess-spirit-caissa-classic">Read the story behind CAISSA Classic</a>, learn more <a href="/about">about CAISSA Chess</a>, or explore more chess writing on the <a href="/blog">CAISSA blog</a>.</p>
                    </section>
                    <a class="yc-landing-cta" href="#ycPageTitle">Enter the CAISSA Lobby</a>
                </div>
`;
html = html.replace(
  /            <\/section>\r?\n\r?\n            <!-- SECTION: CAISSA Academy -->/,
  `${supportingContent}            </section>\n\n            <!-- SECTION: CAISSA Academy -->`
);

html = html.replace(/[ \t]+(?=\r?$)/gm, '');
await writeFile(outputPath, html);
console.log('Generated yahoo-classic.html from index.html');

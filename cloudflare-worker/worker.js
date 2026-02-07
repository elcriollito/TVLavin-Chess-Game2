/**
 * CAISSA Chess - Game Fetcher Worker
 *
 * Cloudflare Worker that fetches games from Chess.com and Lichess
 * to bypass CORS restrictions in the browser.
 *
 * Deploy to: https://api.caissa-chess.org or Workers subdomain
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const ALLOWED_ORIGINS = [
  'https://caissa-chess.org',
  'https://www.caissa-chess.org',
  'https://tv-lavin-chess-game2.vercel.app',
  'https://tv-lavin-chess-game2-git-main-elcriollitos-projects.vercel.app'
];

const CACHE_TTL = 60; // Cache results for 60 seconds
const MAX_GAMES_LIMIT = 50;
const MAX_PGN_SIZE = 100000; // Max 100KB PGN size
const RATE_LIMIT_MAX = 10; // Max 10 requests per minute per IP
const RATE_LIMIT_WINDOW = 60000; // 1 minute in milliseconds

// In-memory rate limiting (resets on Worker restart)
const rateLimitMap = new Map();

// ============================================================================
// CORS HELPER
// ============================================================================

function getCorsHeaders(origin) {
  const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
                    origin?.endsWith('.vercel.app') ||
                    origin?.startsWith('http://localhost:') ||
                    origin?.startsWith('http://127.0.0.1:');

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function corsResponse(data, status = 200, origin = null) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin),
    },
  });
}

// ============================================================================
// RATE LIMITING
// ============================================================================

function checkRateLimit(ip) {
  const now = Date.now();
  const userRequests = rateLimitMap.get(ip) || [];

  // Filter out requests older than the window
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= RATE_LIMIT_MAX) {
    return false; // Rate limit exceeded
  }

  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);

  return true;
}

// ============================================================================
// POLYGLOT OPENING BOOK
// ============================================================================

// Official Polyglot Random64 array (781 values)
// Source: https://python-chess.readthedocs.io/en/latest/polyglot.html
const POLYGLOT_RANDOM64 = [
  0x9D39247E33776D41n, 0x2AF7398005AAA5C7n, 0x44DB015024623547n, 0x9C15F73E62A76AE2n,
  0x75834465489C0C89n, 0x3290AC3A203001BFn, 0x0FBBAD1F61042279n, 0xE83A908FF2FB60CAn,
  0x0D7E765D58755C10n, 0x1A083822CEAFE02Dn, 0x9605D5F0E25EC3B0n, 0xD021FF5CD13A2ED5n,
  0x40BDF15D4A672E32n, 0x011355146FD56395n, 0x5DB4832046F3D9E5n, 0x239F8B2D7FF719CCn,
  0x05D1A1AE85B49AA1n, 0x679F848F6E8FC971n, 0x7449BBFF801FED0Bn, 0x7D11CDB1C3B7ADF0n,
  0x82C7709E781EB7CCn, 0xF3218F1C9510786Cn, 0x331478F3AF51BBE6n, 0x4BB38DE5E7219443n,
  0xAA649C6EBCFD50FCn, 0x8DBD98A352AFD40Bn, 0x87D2074B81D79217n, 0x19F3C751D3E92AE1n,
  0xB4AB30F062B19ABFn, 0x7B0500AC42047AC4n, 0xC9452CA81A09D85Dn, 0x24AA6C514DA27500n,
  0x4C9F34427501B447n, 0x14A68FD73C910841n, 0xA71B9B83461CBD93n, 0x03488B95B0F1850Fn,
  0x637B2B34FF93C040n, 0x09D1BC9A3DD90A94n, 0x3575668334A1DD3Bn, 0x735E2B97A4C45A23n,
  0x18727070F1BD400Bn, 0x1FCBACD259BF02E7n, 0xD310A7C2CE9B6555n, 0xBF983FE0FE5D8244n,
  0x9F74D14F7454A824n, 0x51EBDC4AB9BA3035n, 0x5C82C505DB9AB0FAn, 0xFCF7FE8A3430B241n,
  0x3253A729B9BA3DDEn, 0x8C74C368081B3075n, 0xB9BC6C87167C33E7n, 0x7EF48F2B83024E20n,
  0x11D505D4C351BD7Fn, 0x6568FCA92C76A243n, 0x4DE0B0F40F32A7B8n, 0x96D693460CC37E5Dn,
  0x42E240CB63689F2Fn, 0x6D2BDCDAE2919661n, 0x42880B0236E4D951n, 0x5F0F4A5898171BB6n,
  0x39F890F579F92F88n, 0x93C5B5F47356388Bn, 0x63DC359D8D231B78n, 0xEC16CA8AEA98AD76n,
  0x5355F900C2A82DC7n, 0x07FB9F855A997142n, 0x5093417AA8A7ED5En, 0x7BCBC38DA25A7F3Cn,
  0x19FC8A768CF4B6D4n, 0x637A7780DECFC0D9n, 0x8249A47AEE0E41F7n, 0x79AD695501E7D1E8n,
  0x14ACBAF4777D5776n, 0xF145B6BECCDEA195n, 0xDABF2AC8201752FCn, 0x24C3C94DF9C8D3F6n,
  0xBB6E2924F03912EAn, 0x0CE26C0B95C980D9n, 0xA49CD132BFBF7CC4n, 0xE99D662AF4243939n,
  0x27E6AD7891165C3Fn, 0x8535F040B9744FF1n, 0x54B3F4FA5F40D873n, 0x72B12C32127FED2Bn,
  0xEE954D3C7B411F47n, 0x9A85AC909A24EAA1n, 0x70AC4CD9F04F21F5n, 0xF9B89D3E99A075C2n,
  0x87B3E2B2B5C907B1n, 0xA366E5B8C54F48B8n, 0xAE4A9346CC3F7CF2n, 0x1920C04D47267BBDn,
  0x87BF02C6B49E2AE9n, 0x092237AC237F3859n, 0xFF07F64EF8ED14D0n, 0x8DE8DCA9F03CC54En,
  0x9C1633264DB49C89n, 0xB3F22C3D0B0B38EDn, 0x390E5FB44D01144Bn, 0x5BFEA5B4712768E9n,
  0x1E1032911FA78984n, 0x9A74ACB964E78CB3n, 0x4F80F7A035DAFB04n, 0x6304D09A0B3738C4n,
  0x2171E64683023A08n, 0x5B9B63EB9CEFF80Cn, 0x506AACF489889342n, 0x1881AFC9A3A701D6n,
  0x6503080440750644n, 0xDFD395339CDBF4A7n, 0xEF927DBCF00C20F2n, 0x7B32F7D1E03680ECn,
  0xB9FD7620E7316243n, 0x05A7E8A57DB91B77n, 0xB5889C6E15630A75n, 0x4A750A09CE9573F7n,
  0xCF464CEC899A2F8An, 0xF538639CE705B824n, 0x3C79A0FF5580EF7Fn, 0xEDE6C87F8477609Dn,
  0x799E81F05BC93F31n, 0x86536B8CF3428A8Cn, 0x97D7374C60087B73n, 0xA246637CFF328532n,
  0x043FCAE60CC0EBA0n, 0x920E449535DD359En, 0x70EB093B15B290CCn, 0x73A1921916591CBDn,
  0x56436C9FE1A1AA8Dn, 0xEFAC4B70633B8F81n, 0xBB215798D45DF7AFn, 0x45F20042F24F1768n,
  0x930F80F4E8EB7462n, 0xFF6712FFCFD75EA1n, 0xAE623FD67468AA70n, 0xDD2C5BC84BC8D8FCn,
  0x7EED120D54CF2DD9n, 0x22FE545401165F1Cn, 0xC91800E98FB99929n, 0x808BD68E6AC10365n,
  0xDEC468145B7605F6n, 0x1BEDE3A3AEF53302n, 0x43539603D6C55602n, 0xAA969B5C691CCB7An,
  0xA87832D392EFEE56n, 0x65942C7B3C7E11AEn, 0xDED2D633CAD004F6n, 0x21F08570F420E565n,
  0xB415938D7DA94E3Cn, 0x91B859E59ECB6350n, 0x10CFF333E0ED804An, 0x28AED140BE0BB7DDn,
  0xC5CC1D89724FA456n, 0x5648F680F11A2741n, 0x2D255069F0B7DAB3n, 0x9BC5A38EF729ABD4n,
  0xEF2F054308F6A2BCn, 0xAF2042F5CC5C2858n, 0x480412BAB7F5BE2An, 0xAEF3AF4A563DFE43n,
  0x19AFE59AE451497Fn, 0x52593803DFF1E840n, 0xF4F076E65F2CE6F0n, 0x11379625747D5AF3n,
  0xBCE5D2248682C115n, 0x9DA4243DE836994Fn, 0x066F70B33FE09017n, 0x4DC4DE189B671A1Cn,
  0x51039AB7712457C3n, 0xC07A3F80C31FB4B4n, 0xB46EE9C5E64A6E7Cn, 0xB3819A42ABE61C87n,
  0x21A007933A522A20n, 0x2DF16F761598AA4Fn, 0x763C4A1371B368FDn, 0xF793C46702E086A0n,
  0xD7288E012AEB8D31n, 0xDE336A2A4BC1C44Bn, 0x0BF692B38D079F23n, 0x2C604A7A177326B3n,
  0x4850E73E03EB6064n, 0xCFC447F1E53C8E1Bn, 0xB05CA3F564268D99n, 0x9AE182C8BC9474E8n,
  0xA4FC4BD4FC5558CAn, 0xE755178D58FC4E76n, 0x69B97DB1A4C03DFEn, 0xF9B5B7C4ACC67C96n,
  0xFC6A82D64B8655FBn, 0x9C684CB6C4D24417n, 0x8EC97D2917456ED0n, 0x6703DF9D2924E97En,
  0xC547F57E42A7444En, 0x78E37644E7CAD29En, 0xFE9A44E9362F05FAn, 0x08BD35CC38336615n,
  0x9315E5EB3A129ACEn, 0x94061B871E04DF75n, 0xDF1D9F9D784BA010n, 0x3BBA57B68871B59Dn,
  0xD2B7ADEEDED1F73Fn, 0xF7A255D83BC373F8n, 0xD7F4F2448C0CEB81n, 0xD95BE88CD210FFA7n,
  0x336F52F8FF4728E7n, 0xA74049DAC312AC71n, 0xA2F61BB6E437FDB5n, 0x4F2A5CB07F6A35B3n,
  0x87D380BDA5BF7859n, 0x16B9F7E06C453A21n, 0x7BA2484C8A0FD54En, 0xF3A678CAD9A2E38Cn,
  0x39B0BF7DDE437BA2n, 0xFCAF55C1BF8A4424n, 0x18FCF680573FA594n, 0x4C0563B89F495AC3n,
  0x40E087931A00930Dn, 0x8CFFA9412EB642C1n, 0x68CA39053261169Fn, 0x7A1EE967D27579E2n,
  0x9D1D60E5076F5B6Fn, 0x3810E399B6F65BA2n, 0x32095B6D4AB5F9B1n, 0x35CAB62109DD038An,
  0xA90B24499FCFAFB1n, 0x77A225A07CC2C6BDn, 0x513E5E634C70E331n, 0x4361C0CA3F692F12n,
  0xD941ACA44B20A45Bn, 0x528F7C8602C5807Bn, 0x52AB92BEB9613989n, 0x9D1DFA2EFC557F73n,
  0x722FF175F572C348n, 0x1D1260A51107FE97n, 0x7A249A57EC0C9BA2n, 0x04208FE9E8F7F2D6n,
  0x5A110C6058B920A0n, 0x0CD9A497658A5698n, 0x56FD23C8F9715A4Cn, 0x284C847B9D887AAEn,
  0x04FEABFBBDB619CBn, 0x742E1E651C60BA83n, 0x9A9632E65904AD3Cn, 0x881B82A13B51B9E2n,
  0x506E6744CD974924n, 0xB0183DB56FFC6A79n, 0x0ED9B915C66ED37En, 0x5E11E86D5873D484n,
  0xF678647E3519AC6En, 0x1B85D488D0F20CC5n, 0xDAB9FE6525D89021n, 0x0D151D86ADB73615n,
  0xA865A54EDCC0F019n, 0x93C42566AEF98FFBn, 0x99E7AFEABE000731n, 0x48CBFF086DDF285An,
  0x7F9B6AF1EBF78BAFn, 0x58627E1A149BBA21n, 0x2CD16E2ABD791E33n, 0xD363EFF5F0977996n,
  0x0CE2A38C344A6EEDn, 0x1A804AADB9CFA741n, 0x907F30421D78C5DEn, 0x501F65EDB3034D07n,
  0x37624AE5A48FA6E9n, 0x957BAF61700CFF4En, 0x3A6C27934E31188An, 0xD49503536ABCA345n,
  0x088E049589C432E0n, 0xF943AEE7FEBF21B8n, 0x6C3B8E3E336139D3n, 0x364F6FFA464EE52En,
  0xD60F6DCEDC314222n, 0x56963B0DCA418FC0n, 0x16F50EDF91E513AFn, 0xEF1955914B609F93n,
  0x565601C0364E3228n, 0xECB53939887E8175n, 0xBAC7A9A18531294Bn, 0xB344C470397BBA52n,
  0x65D34954DAF3CEBDn, 0xB4B81B3FA97511E2n, 0xB422061193D6F6A7n, 0x071582401C38434Dn,
  0x7A13F18BBEDC4FF5n, 0xBC4097B116C524D2n, 0x59B97885E2F2EA28n, 0x99170A5DC3115544n,
  0x6F423357E7C6A9F9n, 0x325928EE6E6F8794n, 0xD0E4366228B03343n, 0x565C31F7DE89EA27n,
  0x30F5611484119414n, 0xD873DB391292ED4Fn, 0x7BD94E1D8E17DEBCn, 0xC7D9F16864A76E94n,
  0x947AE053EE56E63Cn, 0xC8C93882F9475F5Fn, 0x3A9BF55BA91F81CAn, 0xD9A11FBB3D9808E4n,
  0x0FD22063EDC29FCAn, 0xB3F256D8ACA0B0B9n, 0xB03031A8B4516E84n, 0x35DD37D5871448AFn,
  0xE9F6082B05542E4En, 0xEBFAFA33D7254B59n, 0x9255ABB50D532280n, 0xB9AB4CE57F2D34F3n,
  0x693501D628297551n, 0xC62C58F97DD949BFn, 0xCD454F8F19C5126An, 0xBBE83F4ECC2BDECB n,
  0xDC842B7E2819E230n, 0xBA89142E007503B8n, 0xA3BC941D0A5061CBn, 0xE9F6760E32CD8021n,
  0x09C7E552BC76492Fn, 0x852F54934DA55CC9n, 0x8107FCCF064FCF56n, 0x098954D51FFF6580n,
  0x23B70EDB1955C4BFn, 0xC330DE426430F69Dn, 0x4715ED43E8A45C0An, 0xA8D7E4DAB780A08Dn,
  0x0572B974F03CE0BBn, 0xB57D2E985E1419C7n, 0xE8D9ECBE2CF3D73Fn, 0x2FE4B17170E59750n,
  0x11317BA87905E790n, 0x7FBF21EC8A1F45ECn, 0x1725CABFCB045B00n, 0x964E915CD5E2B207n,
  0x3E2B8BCBF016D66Dn, 0xBE7444E39328A0ACn, 0xF85B2B4FBCDE44B7n, 0x49353FEA39BA63B1n,
  0x1DD01AAFCD53486An, 0x1FCA8A92FD719F85n, 0xFC7C95D827357AFAn, 0x18A6A990C8B35EBDn,
  0xCCCB7005C6B9C28Dn, 0x3BDBB92C43B17F26n, 0xAA70B5B4F89695A2n, 0xE94C39A54A98307Fn,
  0xB7A0B174CFF6F36En, 0xD4DBA84729AF48ADn, 0x2E18BC1AD9704A68n, 0x2DE0966DAF2F8B1Cn,
  0xB9C11D5B1E43A07En, 0x64972D68DEE33360n, 0x94628D38D0C20584n, 0xDBC0D2B6AB90A559n,
  0xD2733C4335C6A72Fn, 0x7E75D99D94A70F4Dn, 0x6CED1983376FA72Bn, 0x97FCAACBF030BC24n,
  0x7B77497B32503B12n, 0x8547EDDFB81CCB94n, 0x79999CDFF70902CBn, 0xCFFE1939438E9B24n,
  0x829626E3892D95D7n, 0x92FAE24291F2B3F1n, 0x63E22C147B9C3403n, 0xC678B6D860284A1Cn,
  0x5873888850659AE7n, 0x0981DCD296A8736Dn, 0x9F65789A6509A440n, 0x9FF38FED72E9052Fn,
  0xE479EE5B9930578Cn, 0xE7F28ECD2D49EECDn, 0x56C074A581EA17FEn, 0x5544F7D774B14AEFn,
  0x7B3F0195FC6F290Fn, 0x12153635B2C0CF57n, 0x7F5126DBBA5E0CA7n, 0x7A76956C3EAFB413n,
  0x3D5774A11D31AB39n, 0x8A1B083821F40CB4n, 0x7B4A38E32537DF62n, 0x950113646D1D6E03n,
  0x4DA8979A0041E8A9n, 0x3BC36E078F7515D7n, 0x5D0A12F27AD310D1n, 0x7F9D1A2E1EBE1327n,
  0xDA3A361B1C5157B1n, 0xDCDD7D20903D0C25n, 0x36833336D068F707n, 0xCE68341F79893389n,
  0xAB9090168DD05F34n, 0x43954B3252DC25E5n, 0xB438C2B67F98E5E9n, 0x10DCD78E3851A492n,
  0xDBC27AB5447822BFn, 0x9B3CDB65F82CA382n, 0xB67B7896167B4C84n, 0xBFCED1B0048EAC50n,
  0xA9119B60369FFEBDn, 0x1FFF7AC80904BF45n, 0xAC12FB171817EEE7n, 0xAF08DA9177DDA93Dn,
  0x1B0CAB936E65C744n, 0xB559EB1D04E5E932n, 0xC37B45B3F8D6F2BAn, 0xC3A9DC228CAAC9E9n,
  0xF3B8B6675A6507FFn, 0x9FC477DE4ED681DAn, 0x67378D8ECCEF96CBn, 0x6DD856D94D259236n,
  0xA319CE15B0B4DB31n, 0x073973751F12DD5En, 0x8A8E849063F91D4Fn, 0x2A5FA5C1C1F6DDCF n,
  0x0748B45FF67A7191n, 0xD3A94CF1C3C23A6An, 0x6C1F95DCB1C719DBn, 0xE929BE7E7C509024n,
  0x5BCD3EDFBD70E9F9n, 0x4B7B6CB01D6CADB7n, 0x4CA82D04C5B12CEDN, 0xFD5E7B05FF823D18n,
  0xB31DAB86FF6E2D37n, 0xA76E6E1A6D4C039Dn, 0xE1B5EBE1D3715B2An, 0x5F8F5B90CD4A7E03n,
  0x90149AB87B7D5F43n, 0xD7E83FF93C23F9EEn, 0x2F76B83B5D33441Cn, 0x8C99C4940F63D5D4n,
  0x6A2D4C8FAF14C4E0n, 0x36E4A164A0A5F02An, 0x4A3AFBCBC6FC19D4n, 0x8F39A1F1B7A42F5Fn,
  0xC6A2DCF1A0E21E07n, 0x3F96AB04B7BF46ACn, 0xB3B1FA9F287FB878n, 0x47CF8C0FCB18D3C0n,
  0x1910D26D4677F6ECn, 0x8A3DBD6FD318D8D6n, 0x0C42B8B7ED80D6F0n, 0x5D8E0FA08D0CECCBn,
  0xD8BA2A2C6E6C7C5An, 0x68A5B9D03653F171n, 0x31DCC03E69E8BDFD n, 0x9AF60E51F8E3BF8Fn,
  0xC82EFF65F4F9F84Fn, 0xD909E19EC8ED0109n, 0x55BF18DE2E9BF3B4n, 0xDB2EDF916C59FCFAn,
  0xE54CAA6B26FC40C6n, 0x25CB7AB5B2DBEBEF n, 0x4BF4F0E71FEB5EDFF, 0x57F0FDCAFFABBBEAn,
  0x07E33EBCB3D87DADn, 0x3A4DA1BC0A8B0D82n, 0xE1A82AABF52EB9BBn, 0x2BE35BFD0F4D3F56n,
  0x0CF7EB8D9C067EAEn, 0x72DF1A5D4087AC02n, 0x53FE9F37A7E81FE4n, 0xBEBE3AC4F82DA993n,
  0xA9E1486F9D45BB6An, 0xD1C15C72ADA93017n, 0x967DB4AE3D5E4FD2n, 0x63B8F9BB6FB37E70n,
  0xB33FE18C88C1FC7Dn, 0xCD6CC219D57ACB8An, 0x701C2F3E76FBD7FAn, 0x91B6CFE75E4F8D1Bn,
  0x6A8CD3D31D87D39Dn, 0x7BD4C9F7F75E5FCCn, 0xDD2C544A5772E97Bn, 0xEC912B69DBE1F0C3n,
  0x13C2EE9894BC5F0Dn, 0xBAE61B2C4A719AB0n, 0x8B23BFDC8DC22AEFn, 0xCD7FC81A4C8C8669n,
  0x3C6DE09B59087D09n, 0x3F653BEB0F999A19n, 0xC5BAF35F99C14E16n, 0x74BF1B2EDF0B08EDn,
  0xE7BB15B22D50B0B0n, 0x5A6ED27C4F66DAC7n, 0x19BA4E8B8E3EB039n, 0x5A12DE1C0F3126D9n,
  0x2B2318BCA5A9A47Cn, 0x26CE03189C6E7B96n, 0x68B9D59AA99178B7n, 0xE7B2BC9AAA0CDC12n,
  0x5F7A0FB2C5DCB46Fn, 0xFC0E96EF80D8EA48n, 0x95ADC58A7D8B0FDEn, 0x7F10AA3CD60AB2CDn,
  0x0E99EB30B0C61F12n, 0x04E38FA1D900E9ACn, 0x43C5B30B28F07012n, 0x3CDD32A14A842DECn,
  0xC4F17D9E5D76A893n, 0x0E3B9B5FDB879239n, 0xE94BA4C6F4C54CA2n, 0x1C86CBEB0F7C5C94n,
  0x37A6D2E2BECF85BEn, 0x5D50E3A2A04DFB17n, 0x79B44F9D32F7BF7Fn, 0xC80E1B5CCB6ED04Dn,
  0xCC6BD09091D33C82n, 0x06F30F42F07F8F83n, 0xA2F36C4C46A5C5EAn, 0x7AAE89C5EA57854En,
  0x8E55E8BC22B68B99n, 0x7F4CFB6F6BD2E3F7n, 0xDFB07B13D9F0D2ABn, 0x6F5072D0D2BC6A79n,
  0x64FC0FFBC8EB5AA9n, 0x9144B65BAF8E92F2n, 0xCF22BFB27A7B3ACDn, 0x21C83A7A73A4D96Bn,
  0x7EC8E32F5B8A9C0En, 0xABB5E4B9B0FF49D2n, 0x7AEB87C7EC21E72Bn, 0xDF6E8E8103F27A66n,
  0xB50F98A0044A88B5n, 0xECA53BA61A85EB0Dn, 0xB0BB2E88F58A44A0n, 0xC6F53E78AD95E8E5n,
  0xBE3DE50C8BFAE3FFn, 0xB8EFCD1E7FB96C3En, 0x5C5E8AEBB0B5F6BBn, 0x8856F1EA58C82B8Bn,
  0xA80EC12EE28C55F9n, 0x7FD9E806CA3B68E3n, 0x98D8D9D8EE057E3Cn, 0xBE04BF0E62E3A88En,
  0x4FB9A75D2FB9BC70n, 0x1C0E08A1EA7E8C10n, 0x4AB5ABDCBBC49E96n, 0x08E4CFCE8A2F94EBn,
  0xC066B73C1F0A0BB9n, 0xB9C375FD9D9D6F36n, 0x19D0FB36FF97F11Bn, 0x82E43FF43EC71EC8n,
  0x3F58AB07D98A21E6n, 0x0CE66E4E09C7DCD1n, 0x8D93102B3AC2D7E3n, 0x22A90E14F42E9A60n,
  0x10B1A4CA9E4D7FC9n, 0x7D92BD5F5C2FE79Cn, 0x1A3D5E2E59D7DC99n, 0xA3ACA97009BBFA3En,
  0x60DC73E9C3EF1E78n, 0xE0B59C4E5F0B6B5Cn, 0x7D37E11ABBFB7CF4n, 0xD1EF9A36E9FC1AC5n,
  0x48F60F9A5DA8A11Bn, 0x01DE8EAD40B7D6DDn, 0xCE2FE8A03E7A9C47n, 0x92FA2B1D5BA9E2D6n,
  0xE21D5BFDE5C1E94Bn, 0xDAB21CE8FA29F00En, 0xCE5CE2CE6F86B476n, 0x69C9585C8A6E1E48n,
  0x8CDDCC9BB098A662n, 0x4A9C37A45DB31B9An, 0x4DD5FA9058A3B2EEn, 0x5CCC2BBBFBDAECCEn,
  0x5EF20AED3F0856B7n, 0xA87D67A39C35EF11n, 0x8C0B15289C0CAADEn, 0xCF59DD5D82CDC5F6n,
  0x19F4B5C7C8FDA05Dn, 0xDE3BD0DA62CD0C09n, 0x5C4F67FF3AB7C17Bn, 0x0B5EDDB4CBBBC40Fn,
  0xE5BA7E9B2F2F59F3n, 0x88B29A5A49EBB06An, 0x8ED2A81E099E84D4n, 0x25BF54BC74D18B95n,
  0x40DB06099E8F7B90n, 0xA2DA5F94C85F3EB2n, 0xB38D1B7BF8F3B0CBn, 0x9DA65F1925B54C3Cn,
  0x1E14C8BA9E43FA93n, 0x63D8FF962F08D8ACn, 0x5DC78D6B57677FBEn, 0xF1B699E90A1F94F4n,
  0xA35DB29D04652691n, 0x4C7CC55F4BBF7DAEn, 0x6C20D94D2FBF7ACDn, 0xED9F4DD8093FF8F6n,
  0xB9063B06B6A3A73En, 0x76F6FEC4A5CFE46Bn, 0x3FD05EA19ECC8349n, 0x1B0A45F45279DE7Dn,
  0xE66F45EB26DDE0CBn, 0x41EA7D1A55A02E48n, 0x68D51BD9A48FEEE7n, 0xBFD49D91E4B6A55Fn,
  0x8BA086FC62DCBBE9n, 0x0F88D89AC5A83A19n, 0x087BF77C6EFFD37Fn, 0x41D3C854A0E9D5F8n,
  0xF6B87FD65197E63Cn, 0x6BC04A88F8FBC69Fn, 0xB4B57F2E8CC4C0F1n, 0xE96FFE5CDE67C6D6n,
  0x7B92D5DAE63EA0FEn, 0xE2B7C62A5AF2A3A7n, 0x6B054E37C7ECDF25n, 0xEB45F0DF2BCFE9E8n,
  0x48E4D68C48E2C67Bn, 0x17F3ABFB5A39FFEAn, 0x46C73D41BE3B3ACFn, 0x5D77BD49B3C39D5Dn,
  0x58B57ABF15B2B33Fn, 0x6BD1E2B49F26E577n, 0x34E5C16C76C7E9C8n, 0x02BBE1C66A3DE75Bn,
  0x18DBE8857CDA69D9n, 0x96FD5DD94FD0AEEDn, 0x0A8B0B5B32E8ACC9n, 0x5CB9C0E2F9C5C5FCn,
  0x88CD5024FAFF8E15n, 0xF3C84EDAB9398493n, 0xC00CDA85E5D89D38n, 0xF9A9E91FEECD2049n,
  0x7FF64FE60E0CB5FFn, 0xC70F2FF3FB98FD36n, 0x8A839EA08E07697Bn, 0xDFEB8A1BED92E51En,
  0x9D9CB2B8C50A17E4n, 0x30AC3C88B30CA14Fn, 0xCAB9B0A80FB62D29n, 0x87B7B0B46D41B8FBn,
  0xB1F6A6ECE67061BFn, 0x6B4EC09B2BA9AB18n, 0x0CE5E30C3BB8DC59n, 0xD5C30C2B7AA96D3Dn,
  0x4E3F7ECDCFFE0CFEn, 0x73CAF0E9F2ED8FE0n, 0x5FFC1FE5E2A1EA52n, 0xA85E75BBBBB09E26n,
  0x77C53B569E67924An, 0xFD945F7E82A8F931n, 0x13E6CA02A3E6E87Dn, 0x68A09B06C6D076BEn,
  0x95F8D47EA92D5B84n, 0xF6A62D8EFA83CC6Fn, 0x2AF577BC7EE78F47n, 0x75B4E4E7ED49AE93n,
  0x67EFCD11FF7F5537n, 0xBED6FDA29AF31D4Bn, 0xB5BE4CD4E1C98CF9n, 0x54A91B6FE4073FCBn,
  0x6CEA8CE7D4ABBBCDn, 0xCBDD3A76AC5CFE4En, 0x6FC5BAB3F17C9D42n, 0x8F8C04A3FBE12DC0n,
  0xA06F14F5AC9FAA31n, 0x89F0B0CBE6DD9F8Fn, 0x0E1FE86E78C1D47Dn, 0x0C99F5D88B4DA5F3n,
  0x06C2E1BB12E49E72n, 0xCE8EB82F16A2CD90n, 0x7BB54B1E05806E08n, 0x3D1A8ED4C51F46B8n,
  0x3D7E5E786D26A0B2n, 0x46924F621D22D27Fn, 0xE94EFDF5DFD10A2Cn, 0x2BF9A65F62A0DFA7n,
  0xFC5CA2B4E89BB95Cn, 0x4ADF9E7A3A47EF44n, 0x4E44BFDC5A79AAF0n, 0x80D94FB1ABC7B2E6n,
  0x7E9AB6C6CF86B2F5n, 0xF78A25EDA5E78A9Dn, 0x5FA02CBBB782CC4Fn, 0x43A6DADDA96F6B28n,
  0xF86F10A3C0829936n, 0x5FE69E8DD069FF6Fn, 0x8C2CBE01D5BAFDBAn, 0x5B76CE3B38E65E30n,
  0x2F9827F12E99EB48n, 0x05BBBAC8D60F1E6Fn, 0xBC5C64B61D48649Dn, 0x7C8B6F96E50DE13Cn,
  0xF4FF65F7E076E381n, 0x3A4D3EBBDA3A58F4n, 0xA55A1F9AE4F8A17Dn, 0x9EAEE4FCBD9F6D0Dn,
  0xEB0BA8FFED6EA5EDn, 0x7C05DB06A8A2CDD6n, 0xB98E6D1CD904B0F7n, 0x20A1D7C3C4ADBF09n,
  0x44EDF4DEA66A3B30n, 0x81BB0726EAF89837n, 0x5FE6BDA2B0E60A04n, 0x0CEC48D577EB7CD7n,
  0xB3B34ABF0C59E5BAn, 0x3A0A0FA07EE61C23n, 0x9C20B00FC25A0B02n, 0xFB2EDA7F83EB37E8n,
  0x6B9DA2BB4FA56A8Dn, 0x5F1C41A27C3EDBCFn, 0xC26F14F19B28BF26n, 0x9E5ED2B1DED54C86n,
  0xCBA55AA1F7C63AD7n, 0x93C38AB6B0CC84D0n, 0xEDBCC6FD85E0E30Cn, 0xF5BAA5BB12EA28A4n,
  0x9D5B9CC58DF8B19Dn, 0x5B0BD8EC9CE7E57Bn, 0xC02C5DE6AC1CF2DAn, 0xA7E07CBDEC5A9C40n,
  0x53E7F76DAFD5B9D2n, 0x4E5CBA2DB87CF7D6n, 0xE8FCA2BC0DC11E02n, 0x83B89E3D8AD77C84n,
  0x7B43466F32F28A5An, 0xE83ED76BC4EAFB70n, 0x3D488AB60ACE67A6n, 0x0DC4BFC1EAA28E04n,
  0x0B4654EAFAE69BF7n, 0x4E1C951E5D4E4CFBn, 0xD1FB7E2D3F7EB89En, 0x86529E6CBAC03A33n,
  0xCB798F79878F8A9En, 0xA9D6C41B5D08579En, 0x85049A3B2F4E2A16n, 0x3C9E41D9F5C703E0n,
  0xEC8CDCCEAD99A4FBn, 0x9C6B1E14B79E3A43n, 0xA4169B1BD52AC882n, 0x18DBD914B1EE87AFn,
  0x3062EA9867AC1FA2n, 0xE53E89E47C7A1CE3n, 0xCD7826B80F2D64D6n, 0xF8D626AAAF278509n
];

// Cache for book size (avoid HEAD on every request)
let bookSizeCache = null;

/**
 * Parse FEN string into board structure
 */
function parseFEN(fen) {
  const parts = fen.trim().split(' ');
  const piecePlacement = parts[0];
  const activeColor = parts[1] || 'w';
  const castling = parts[2] || '-';
  const enPassant = parts[3] || '-';

  // Parse board
  const board = [];
  const ranks = piecePlacement.split('/');

  for (let rank = 0; rank < 8; rank++) {
    const rankStr = ranks[rank];
    const row = [];

    for (let i = 0; i < rankStr.length; i++) {
      const char = rankStr[i];

      if (char >= '1' && char <= '8') {
        // Empty squares
        const emptyCount = parseInt(char);
        for (let j = 0; j < emptyCount; j++) {
          row.push(null);
        }
      } else {
        // Piece
        row.push(char);
      }
    }

    board.push(row);
  }

  return { board, activeColor, castling, enPassant };
}

/**
 * Compute Polyglot Zobrist hash for a position
 */
function computePolyglotHash(fen) {
  const { board, activeColor, castling, enPassant } = parseFEN(fen);

  let hash = 0n;

  // Piece encoding: Black pnbrqk = 0,2,4,6,8,10 / White PNBRQK = 1,3,5,7,9,11
  const pieceToIndex = {
    'P': 1, 'N': 3, 'B': 5, 'R': 7, 'Q': 9, 'K': 11,  // White
    'p': 0, 'n': 2, 'b': 4, 'r': 6, 'q': 8, 'k': 10   // Black
  };

  // Hash pieces on board
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece) {
        const pieceIndex = pieceToIndex[piece];
        if (pieceIndex !== undefined) {
          const square = rank * 8 + file;  // 0-63
          const zobristIndex = 64 * pieceIndex + square;
          hash ^= POLYGLOT_RANDOM64[zobristIndex];
        }
      }
    }
  }

  // Hash castling rights (indices 768-771)
  if (castling.includes('K')) hash ^= POLYGLOT_RANDOM64[768];
  if (castling.includes('Q')) hash ^= POLYGLOT_RANDOM64[769];
  if (castling.includes('k')) hash ^= POLYGLOT_RANDOM64[770];
  if (castling.includes('q')) hash ^= POLYGLOT_RANDOM64[771];

  // Hash en passant file (indices 772-779)
  if (enPassant !== '-') {
    const epFile = enPassant.charCodeAt(0) - 'a'.charCodeAt(0);  // 0-7
    if (epFile >= 0 && epFile < 8) {
      hash ^= POLYGLOT_RANDOM64[772 + epFile];
    }
  }

  // Hash side to move: XOR if WHITE to move (index 780)
  if (activeColor === 'w') {
    hash ^= POLYGLOT_RANDOM64[780];
  }

  return hash;
}

/**
 * Binary search on R2 book using range requests
 */
async function searchBookOnR2(env, targetHash) {
  const bookKey = env.BOOK_OBJECT_KEY || 'Cerebellum3Merge.bin';
  const ENTRY_SIZE = 16;
  const CHUNK_SIZE = 4096; // Read 256 entries at once (4KB)

  try {
    // Get book size (cached)
    if (!bookSizeCache) {
      const headResp = await env.BOOK_BUCKET.head(bookKey);
      if (!headResp) {
        return { error: 'Book not found in R2', bookKey };
      }
      bookSizeCache = headResp.size;
    }

    const bookSize = bookSizeCache;
    const numEntries = Math.floor(bookSize / ENTRY_SIZE);

    let left = 0;
    let right = numEntries - 1;
    let matchStart = -1;

    // Binary search to find first matching entry
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const offset = mid * ENTRY_SIZE;

      // Read one entry at midpoint
      const entryResp = await env.BOOK_BUCKET.get(bookKey, {
        range: { offset, length: ENTRY_SIZE }
      });

      if (!entryResp) break;

      const buffer = await entryResp.arrayBuffer();
      const view = new DataView(buffer);

      // Read 64-bit key (big-endian)
      const keyHigh = view.getUint32(0, false);
      const keyLow = view.getUint32(4, false);
      const entryKey = (BigInt(keyHigh) << 32n) | BigInt(keyLow);

      if (entryKey === targetHash) {
        matchStart = mid;
        right = mid - 1;  // Continue searching left for first match
      } else if (entryKey < targetHash) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    if (matchStart === -1) {
      return { moves: [] };  // Not found
    }

    // Collect all matching entries (they're contiguous in sorted file)
    const moves = [];
    let currentIndex = matchStart;

    while (currentIndex < numEntries && moves.length < 50) {
      // Read chunk of entries
      const chunkOffset = currentIndex * ENTRY_SIZE;
      const chunkResp = await env.BOOK_BUCKET.get(bookKey, {
        range: { offset: chunkOffset, length: CHUNK_SIZE }
      });

      if (!chunkResp) break;

      const buffer = await chunkResp.arrayBuffer();
      const numChunkEntries = Math.floor(buffer.byteLength / ENTRY_SIZE);

      for (let i = 0; i < numChunkEntries; i++) {
        const view = new DataView(buffer, i * ENTRY_SIZE, ENTRY_SIZE);

        // Read key
        const keyHigh = view.getUint32(0, false);
        const keyLow = view.getUint32(4, false);
        const entryKey = (BigInt(keyHigh) << 32n) | BigInt(keyLow);

        if (entryKey !== targetHash) {
          // Reached end of matches
          return { moves };
        }

        // Read move and weight
        const moveEncoded = view.getUint16(8, false);
        const weight = view.getUint16(10, false);

        moves.push({ moveEncoded, weight });
      }

      currentIndex += numChunkEntries;
    }

    return { moves };

  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Decode Polyglot move format to UCI
 */
function decodePolyglotMove(encoded) {
  const fromSquare = encoded & 0x3F;
  const toSquare = (encoded >> 6) & 0x3F;
  const promotion = (encoded >> 12) & 0x7;

  const files = 'abcdefgh';
  const ranks = '12345678';

  const fromFile = fromSquare % 8;
  const fromRank = Math.floor(fromSquare / 8);
  const toFile = toSquare % 8;
  const toRank = Math.floor(toSquare / 8);

  let uci = files[fromFile] + ranks[fromRank] + files[toFile] + ranks[toRank];

  if (promotion > 0) {
    const promotionPieces = ['', 'n', 'b', 'r', 'q'];
    uci += promotionPieces[promotion];
  }

  return uci;
}

/**
 * Convert UCI to SAN (simplified)
 */
function uciToSAN(uci, fen) {
  // Simplified conversion - just adds piece prefix and capture notation
  // Full conversion would require validating the move on the board

  const from = uci.substring(0, 2);
  const to = uci.substring(2, 4);
  const promotion = uci.length > 4 ? uci[4].toUpperCase() : '';

  // Parse board to check what piece is moving
  const { board } = parseFEN(fen);
  const fromFile = from.charCodeAt(0) - 'a'.charCodeAt(0);
  const fromRank = 7 - (from.charCodeAt(1) - '1'.charCodeAt(0));  // Flip rank
  const toFile = to.charCodeAt(0) - 'a'.charCodeAt(0);
  const toRank = 7 - (to.charCodeAt(1) - '1'.charCodeAt(0));

  const piece = board[fromRank]?.[fromFile];
  const targetPiece = board[toRank]?.[toFile];
  const isCapture = targetPiece !== null;

  if (!piece) return uci;  // Fallback

  const pieceType = piece.toUpperCase();

  // Pawn moves
  if (pieceType === 'P') {
    let san = '';
    if (isCapture) {
      san = from[0] + 'x' + to;
    } else {
      san = to;
    }
    if (promotion) san += '=' + promotion;
    return san;
  }

  // Piece moves
  let san = pieceType;
  if (isCapture) san += 'x';
  san += to;

  return san;
}

/**
 * Handle opening book query
 */
async function handleBookQuery(request, env) {
  const url = new URL(request.url);
  const fen = url.searchParams.get('fen');
  const maxMoves = parseInt(url.searchParams.get('max') || '12');

  if (!fen) {
    return { error: 'Missing FEN parameter', usage: '/api/book?fen=<FEN>&max=12' };
  }

  try {
    // Compute Polyglot hash
    const hash = computePolyglotHash(fen);

    // Search on R2
    const searchResult = await searchBookOnR2(env, hash);

    if (searchResult.error) {
      return { error: searchResult.error, fen, hash: hash.toString(16) };
    }

    // Decode moves
    const movesWithWeight = searchResult.moves.slice(0, maxMoves);
    const totalWeight = movesWithWeight.reduce((sum, m) => sum + m.weight, 0);

    const moves = movesWithWeight.map(m => {
      const uci = decodePolyglotMove(m.moveEncoded);
      const san = uciToSAN(uci, fen);
      const percent = totalWeight > 0 ? (m.weight / totalWeight * 100) : 0;

      return {
        uci,
        san,
        weight: m.weight,
        percent: Math.round(percent * 10) / 10
      };
    });

    return {
      moves,
      fen,
      totalEntries: moves.length,
      bookName: env.BOOK_OBJECT_KEY || 'Cerebellum3Merge',
      cached: false
    };

  } catch (error) {
    return {
      error: 'Book query failed',
      message: error.message,
      fen
    };
  }
}

// ============================================================================
// CHESS.COM FETCHER
// ============================================================================

async function fetchChessComGames(username, maxGames = 20, timeControl = 'all') {
  const warnings = [];
  const games = [];

  try {
    // Step 1: Get player's game archives
    const archivesUrl = `https://api.chess.com/pub/player/${username}/games/archives`;
    const archivesResp = await fetch(archivesUrl);

    if (!archivesResp.ok) {
      if (archivesResp.status === 404) {
        throw new Error(`Chess.com user "${username}" not found`);
      }
      throw new Error(`Chess.com API error: ${archivesResp.status}`);
    }

    const archivesData = await archivesResp.json();
    const archives = archivesData.archives || [];

    if (archives.length === 0) {
      throw new Error(`No game archives found for user "${username}"`);
    }

    // Step 2: Fetch games from most recent archives (newest first)
    const recentArchives = archives.slice(-3).reverse(); // Last 3 months, newest first

    for (const archiveUrl of recentArchives) {
      if (games.length >= maxGames) break;

      const gamesResp = await fetch(archiveUrl);
      if (!gamesResp.ok) continue;

      const gamesData = await gamesResp.json();
      const monthGames = gamesData.games || [];

      // Filter by time control if specified
      const filteredGames = timeControl === 'all'
        ? monthGames
        : monthGames.filter(g => {
            const tc = g.time_class?.toLowerCase();
            return tc === timeControl.toLowerCase();
          });

      // Add games (newest first)
      games.push(...filteredGames.reverse());

      if (games.length > maxGames) {
        games.length = maxGames; // Trim to limit
      }
    }

    if (games.length === 0) {
      throw new Error(`No games found for ${username} with time control: ${timeControl}`);
    }

    // Step 3: Extract PGN from games
    const pgnChunks = games.map(game => {
      if (game.pgn) {
        return game.pgn.trim();
      }

      // Fallback: build minimal PGN from game data
      warnings.push(`Game ${game.url} missing PGN - using fallback`);
      return buildFallbackPGN(game);
    });

    const combinedPGN = pgnChunks.join('\n\n');

    return {
      pgn: combinedPGN,
      count: games.length,
      source: 'chess.com',
      warnings,
    };

  } catch (error) {
    throw new Error(`Chess.com fetch failed: ${error.message}`);
  }
}

function buildFallbackPGN(game) {
  const white = game.white?.username || 'Unknown';
  const black = game.black?.username || 'Unknown';
  const result = game.pgn?.match(/\[Result "([^"]+)"\]/)?.[1] || '*';
  const date = new Date(game.end_time * 1000).toISOString().split('T')[0].replace(/-/g, '.');

  return `[Event "Chess.com Game"]
[Site "${game.url || '?'}"]
[Date "${date}"]
[White "${white}"]
[Black "${black}"]
[Result "${result}"]

${result}`;
}

// ============================================================================
// LICHESS FETCHER
// ============================================================================

async function fetchLichessGames(username, maxGames = 20, timeControl = 'all') {
  const warnings = [];

  try {
    // Lichess API endpoint for user games (PGN format)
    // https://lichess.org/api#tag/Games/operation/apiGamesUser
    let url = `https://lichess.org/api/games/user/${username}?max=${maxGames}&moves=true&tags=true&clocks=false&evals=false&opening=false`;

    // Map time control to Lichess perf types
    if (timeControl !== 'all') {
      const perfTypeMap = {
        'bullet': 'bullet',
        'blitz': 'blitz',
        'rapid': 'rapid',
        'classical': 'classical',
      };

      const perfType = perfTypeMap[timeControl.toLowerCase()];
      if (perfType) {
        url += `&perfType=${perfType}`;
      } else {
        warnings.push(`Unknown time control "${timeControl}" - fetching all games`);
      }
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/x-chess-pgn',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Lichess user "${username}" not found`);
      }
      throw new Error(`Lichess API error: ${response.status}`);
    }

    const pgnText = await response.text();

    if (!pgnText || pgnText.trim().length === 0) {
      throw new Error(`No games found for Lichess user "${username}"`);
    }

    // Count games by counting [Event tags
    const gameCount = (pgnText.match(/\[Event /g) || []).length;

    return {
      pgn: pgnText.trim(),
      count: gameCount,
      source: 'lichess.org',
      warnings,
    };

  } catch (error) {
    throw new Error(`Lichess fetch failed: ${error.message}`);
  }
}

// ============================================================================
// PGN VALIDATION & PARSING
// ============================================================================

/**
 * Validate PGN format and size
 * @param {string} pgn - PGN text to validate
 * @returns {object} - { valid: boolean, error?: string }
 */
function validatePGN(pgn) {
  // Check if PGN is provided
  if (!pgn || typeof pgn !== 'string') {
    return { valid: false, error: 'PGN is required' };
  }

  // Check size limit
  if (pgn.length > MAX_PGN_SIZE) {
    return {
      valid: false,
      error: `PGN too large (max ${MAX_PGN_SIZE} characters, got ${pgn.length})`
    };
  }

  // Check minimum length
  if (pgn.trim().length < 10) {
    return { valid: false, error: 'PGN too short or empty' };
  }

  // Check for basic PGN structure (at least one bracket tag)
  if (!pgn.includes('[') || !pgn.includes(']')) {
    return { valid: false, error: 'Invalid PGN format - missing header tags' };
  }

  return { valid: true };
}

/**
 * Extract game metadata from PGN
 * @param {string} pgn - PGN text
 * @returns {object} - Game metadata
 */
function extractPGNMetadata(pgn) {
  const metadata = {
    moveCount: 0,
    result: '*',
    white: null,
    black: null,
    event: null,
    site: null,
    date: null,
  };

  try {
    // Extract result from [Result "..."] tag
    const resultMatch = pgn.match(/\[Result\s+"([^"]+)"\]/i);
    if (resultMatch) {
      metadata.result = resultMatch[1];
    }

    // Extract white player
    const whiteMatch = pgn.match(/\[White\s+"([^"]+)"\]/i);
    if (whiteMatch) {
      metadata.white = whiteMatch[1];
    }

    // Extract black player
    const blackMatch = pgn.match(/\[Black\s+"([^"]+)"\]/i);
    if (blackMatch) {
      metadata.black = blackMatch[1];
    }

    // Extract event
    const eventMatch = pgn.match(/\[Event\s+"([^"]+)"\]/i);
    if (eventMatch) {
      metadata.event = eventMatch[1];
    }

    // Extract site
    const siteMatch = pgn.match(/\[Site\s+"([^"]+)"\]/i);
    if (siteMatch) {
      metadata.site = siteMatch[1];
    }

    // Extract date
    const dateMatch = pgn.match(/\[Date\s+"([^"]+)"\]/i);
    if (dateMatch) {
      metadata.date = dateMatch[1];
    }

    // Count moves (count move numbers like "1.", "2.", etc.)
    // Split by newlines and filter lines that don't start with [
    const moveText = pgn.split('\n')
      .filter(line => !line.trim().startsWith('['))
      .join(' ');

    // Count move numbers (e.g., "1.", "2.", "3.")
    const moveMatches = moveText.match(/\b\d+\./g);
    if (moveMatches) {
      metadata.moveCount = moveMatches.length;
    }

  } catch (error) {
    // If parsing fails, return partial metadata
    console.error('PGN metadata extraction error:', error);
  }

  return metadata;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

async function handleRequest(request, env) {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const path = url.pathname;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin),
    });
  }

  // Health check endpoint
  if (path === '/api/health' || path === '/health') {
    return corsResponse({
      ok: true,
      service: 'CAISSA Chess Game Fetcher',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    }, 200, origin);
  }

  // Games endpoint
  if (path === '/api/games' || path === '/games') {
    // Rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(ip)) {
      return corsResponse({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please wait a minute and try again.',
      }, 429, origin);
    }

    // Parse query parameters
    const platform = url.searchParams.get('platform') || 'chesscom';
    const username = url.searchParams.get('username');
    const maxGames = Math.min(parseInt(url.searchParams.get('max') || '20'), MAX_GAMES_LIMIT);
    const timeControl = url.searchParams.get('tc') || 'all';

    // Validate parameters
    if (!username) {
      return corsResponse({
        error: 'Missing parameter',
        message: 'Username is required',
      }, 400, origin);
    }

    if (!['chesscom', 'lichess'].includes(platform)) {
      return corsResponse({
        error: 'Invalid platform',
        message: 'Platform must be "chesscom" or "lichess"',
      }, 400, origin);
    }

    // Check cache (using Cloudflare Cache API)
    const cacheKey = `${platform}:${username}:${timeControl}:${maxGames}`;
    const cache = caches.default;
    const cacheUrl = new URL(request.url);
    cacheUrl.searchParams.set('_cache_key', cacheKey);

    let cachedResponse = await cache.match(cacheUrl);
    if (cachedResponse) {
      const data = await cachedResponse.json();
      data.cached = true;
      return corsResponse(data, 200, origin);
    }

    // Fetch games
    try {
      let result;

      if (platform === 'chesscom') {
        result = await fetchChessComGames(username, maxGames, timeControl);
      } else {
        result = await fetchLichessGames(username, maxGames, timeControl);
      }

      result.cached = false;
      result.timestamp = new Date().toISOString();

      // Cache the response
      const response = corsResponse(result, 200, origin);
      const responseToCache = response.clone();

      // Store in cache with TTL
      const cacheResponse = new Response(responseToCache.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
        },
      });

      await cache.put(cacheUrl, cacheResponse);

      return response;

    } catch (error) {
      return corsResponse({
        error: 'Fetch failed',
        message: error.message,
        platform,
        username,
      }, 500, origin);
    }
  }

  // Game endpoint - PGN validation and metadata extraction
  if (path === '/api/game' || path === '/game') {
    // Rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(ip)) {
      return corsResponse({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please wait a minute and try again.',
      }, 429, origin);
    }

    // Get PGN from query parameter
    const pgn = url.searchParams.get('pgn');

    // Validate PGN
    const validation = validatePGN(pgn);
    if (!validation.valid) {
      return corsResponse({
        error: 'Invalid PGN',
        message: validation.error,
      }, 400, origin);
    }

    try {
      // Extract metadata from PGN
      const metadata = extractPGNMetadata(pgn);

      // Return clean response
      return corsResponse({
        success: true,
        game: {
          moveCount: metadata.moveCount,
          result: metadata.result,
          white: metadata.white,
          black: metadata.black,
          event: metadata.event,
          site: metadata.site,
          date: metadata.date,
        },
        pgnSize: pgn.length,
        timestamp: new Date().toISOString(),
      }, 200, origin);

    } catch (error) {
      return corsResponse({
        error: 'Parsing failed',
        message: error.message,
      }, 500, origin);
    }
  }

  // Opening book endpoint
  if (path === '/api/book' || path === '/book') {
    // Rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(ip)) {
      return corsResponse({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please wait a minute and try again.',
      }, 429, origin);
    }

    const bookResult = await handleBookQuery(request, env);
    return corsResponse(bookResult, bookResult.error ? 500 : 200, origin);
  }

  // 404 for unknown routes
  return corsResponse({
    error: 'Not found',
    message: 'Endpoint not found',
    availableEndpoints: ['/api/health', '/api/games', '/api/game', '/api/book'],
  }, 404, origin);
}

// ============================================================================
// WORKER ENTRY POINT
// ============================================================================

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};

const rows = `32a14876178c6e147f6caae9f3033d7a40191462|docs(play): audit current play architecture for season 10
4255936c957717cefa5fdf6dc0fe63ed3ce44fb2|docs(play): define simplified play architecture
d7ee0f4b1befc332e36fa97aef93434ebf828e85|docs(play): plan simplified play migration
d16e21f278eca89e73b6efa8c9bca96fcc9f1b85|test(play): add characterization harness
6b0c4792cbb9a18c5ebd3aa8dfd1fb0ba2d3f387|feat(play): add legacy compatibility boundary
de189016e28c779768a21b8beb8f1887d12d7d6f|feat(play): add normalized game record
d90dd2c3d7cf75286410f84989c4b0fe8a642922|feat(play): add game record persistence foundation
b21477d2dda77881bd7995f78b08f02153b24492|feat(play): isolate engine requests
cf6a18f4b6d18a96748fb7a24bf275496fa585e0|fix(play): preserve engine response attribution
f0599458c952a12db7328d89f2a89c3bf1f96bda|feat(play): add fair-play policy foundation
9bb30b97101c04b3f2520302c2bacfb3ce178440|feat(play): add game lifecycle foundation
2b2e1a0b981bd46ab9a30866288caddab0b41b23|feat(play): transfer local clock ownership
ba8b420726fb16611eeac98e80a34627e1425498|feat(play): isolate analyze handoff state
617cef7d44b54967d22300d53170e9be28c217e0|feat(play): add canonical play routing
c88395f9db5cfcb116a166af3e9b18839cf53a54|feat(play): add chessboard adapter
ca50e090fad193e07c5a15ea4a45e0ec74e6b19f|feat(play): add simplified play shell
a583cbcfa4edf11c1b2c9a71b62a10d8779106e1|fix(play): harden simplified shell on mobile
8cdee55f9782e84507c82a8f062400fe6110ea07|feat(play): add simplified games panel
a3f824c3d7fd36d2ff2eea0dc8e79023060d30af|feat(play): add evaluation rail component
8392c341f9d68a31ad77a39867acefce6893d2c7|feat(play): add post-game experience
25bb0062ca129b2ed786d58fd49a219939a13a5f|feat(play): add bots foundation
7653463c6965637bfdabc89fb30772ff82c95b87|feat(play): refine bot catalog and calibration
6de7c6f8df18ea8813948b0b1907b122528220d1|feat(play): add coach foundation
5b8b6982464eb222a1fe9bead12af90300449824|feat(play): improve coach intervention quality
d9d51e140184fcb3cfa3819c5ede4f716dd26715|feat(play): add endgame coach foundation
548e8cee064f983ee34ac98ff62904fcc42663cf|feat(play): improve endgame coach quality
2491221caa73e9234c0a54d498c866585eb8b598|feat(mentor): add transversal mentor foundation
727e2ca1d7c888dd82e50c25a2aef15be5cbb299|feat(mentor): add review request contract
806a3ef900330a26638db92a9560d856c4bc4a1d|feat(mentor): add educational analysis pipeline foundation
6872a580808bfebf781ad6515b2ae556e7f1818d|feat(mentor): add critical moment selection
6b2f19d48fb3daae888128b026f35ee48f98cb0e|feat(mentor): add guided replay foundation
b88046890f14ccad4c736c1505ac1f2657ec89e3|feat(mentor): integrate knowledge platform
e52979849bc599ff1d0714d30140decd2b25f94d|feat(mentor): add mentor summary
d2a60a83cc78793347c685ea7863198352741f7d|feat(play): add players panel foundation
a15dfb90dc637d7736b8eee0a769325b19dcda47|feat(play): add presence contract
8185e9d530f420528379c87f5204169c25c41c9b|feat(play): add challenge lifecycle
50a7f837d33eda47b148ba21b61078a0bf7292ed|feat(play): add human fair play foundation
b9f800fc93b003ee79467287a7754f43ef89beff|feat(play): consolidate human infrastructure boundaries
0f4e7490f7bc188442f2657fc6bca682059132b9|feat(play): add reusable visual components
d675c4e108a7b90ad2654260d95d9b9c58975477|feat(play): define caissa visual identity boundaries
80474ed2b6eb3b8f83b804ef7afc734f34007454|feat(play): add caissa theme system
031c79e087e65455b81bcd8fafbf47f0afe9cc94|feat(play): complete accessibility foundation
87d5b01a503b40a7b301520b549c368813516cc1|feat(play): harden worker lifecycle
4cf42a91c5047412f0ee73bd46b9f2d809c275f9|feat(play): add lazy loading foundation
67f3e78da3f9f4cacdd14c84819663a0e8c8f645|feat(play): harden event listener lifecycle
5e0692b98f0549875b0707bf06ac6417268acbc6|feat(play): define performance budget
3eeaf3ee82d1d46adfead02ec8b18181bb0bd383|test(play): consolidate unit coverage
3cd56a5bddb3f3dfabdb1ca29354e3bad8f86c8f|test(play): consolidate integration coverage
f94d689c7a4d38363149fd168e672811298c016b|test(play): consolidate responsive coverage
db85284096a6b4d585a50adb4084221e48c8499b|test(play): consolidate regression coverage
88223cb20fc4803fbc02237db44a2e4554eb6221|test(play): complete manual chess QA
5a655ed1b83739b837f098a3868d179498d44f5f|feat(play): add mode selection analytics
4c678dc0df20e457bafa1661d3830a4d94108048|feat(play): add game start analytics
9d67e640c7a043de59e7285fb5e23bdeef05e18b|feat(play): add completion and postgame analytics
f798810ea069c993e12179aee576738651dd28d3|feat(play): add mentor engagement analytics
1442b88562199fa23faf9f22884b9aa025216cf0|feat(play): add analytics governance
5132b34010339acf715e9359dfc239d861778755|docs(play): audit season 10 release readiness`;

const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const commits = rows.split('\n').map((row, index) => { const [hash, subject] = row.split('|');
    const category = subject.startsWith('docs') ? 'documentation' : subject.startsWith('test') ? 'testing'
        : subject.startsWith('fix') ? 'fix' : 'feature';
    const blocked = /players|presence|challenge|human/.test(subject), analytics = /analytics/.test(subject);
    return { hash, shortHash: hash.slice(0, 7), subject, task: `Season 10 chain item ${index + 1}`,
        category, productionImpact: category === 'documentation' || category === 'testing' ? 'none' : analytics ? 'local-observability' : blocked ? 'blocked-scaffolding' : 'qa-gated-runtime',
        activationState: blocked ? 'production-blocked' : analytics ? 'local-only' : category === 'feature' || category === 'fix' ? 'qa-gated' : 'not-runtime',
        rollbackCoupling: category === 'feature' || category === 'fix' ? 'subsystem-dependent' : 'independent',
        testEvidence: category === 'documentation' ? 'release-readiness' : category === 'testing' ? 'owned-suite' : 'play-regression' }; });

export const season10CommitRange = freeze({ schemaVersion: 'Season10CommitRange@1.0.0',
    originBaseline: 'eb0511043dd397ac6ff50f05b4e67a84144b5d78',
    sourceHead: '5132b34010339acf715e9359dfc239d861778755', count: 57, commits });

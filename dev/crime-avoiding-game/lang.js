/**
 * 言語・こどもモード管理モジュール (lang.js)
 * 
 * - 小学生向けの「こどもモード（ひらがな中心）」と「通常モード（漢字）」のワンタップ切り替え
 * - localStorage による設定の保持
 * - DOM要素の data-i18n, data-i18n-placeholder による自動更新
 * - 動的テキスト（AI発言、定型文チップ、システム通知など）のヘルパー提供
 */

class LanguageManager {
    constructor() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('kids')) {
            this.isKidsMode = urlParams.get('kids') === '1' || urlParams.get('kids') === 'true';
        } else {
            this.isKidsMode = localStorage.getItem('crime_kids_mode') === 'true';
        }

        this.dictionary = {
            // ==========================================
            // 通常モード (漢字・一般向け)
            // ==========================================
            default: {
                // ヘッダー
                brandTitle: "犯罪回避ゲーム",
                brandTag: "心理戦 × 防犯体験",
                btnKidsToggle: "👶 こどもモード: OFF",
                btnSoundOn: "🔊 音: ON",
                btnSoundOff: "🔇 音: OFF",
                btnHowToPlay: "📜 ルール説明",
                btnSettings: "⚙️ 接続設定",
                badgeOnline: "● オンライン",
                badgeLocal: "● ローカル",

                // タイトル画面
                gameMainTitle: "犯罪回避ゲーム",
                gameMainSubtitle: "相手の言葉は「ホント」？それとも「ウソ」？<br>見えない相手の心理を読み、目的地まで逃げ切ろう！",
                btnPlaySolo: "🎮 一人でプレイ",
                btnPlayPvp: "👥 2人でプレイ (オンライン)",
                titleSubInfo: "※ 1人でプレイはAI犯罪者との対戦になります",
                kidsBannerTitle: "👶 小学生のみなさんへ",
                kidsBannerDesc: "上の「こどもモード」を押すと、ぜんぶ ひらがなになるよ！",

                // ホーム説明カード
                conceptHeaderTitle: "ゲームの趣旨と大切なお知らせ",
                conceptHeaderSub: "オンライン安全・防犯リテラシー学習のための対戦体験",
                conceptAboutTitle: "🎯 本ゲームについて",
                conceptAboutText: "このゲームは、プレイヤー同士や対AIでそれぞれの目的<strong>（被害者側：犯罪者と接触せずに目的地に向かう ／ 犯罪者側：被害者が目的地に到達する前に接触する）</strong>を達成する過程を、オンライン上の対戦形式で体験できるようにしたものです。",
                warningCautionTitle: "⚠️ 免責事項",
                warningCautionText: "本ゲームは<strong>実際の犯罪を助長するようなゲームではありません。</strong>",
                warningDangerTitle: "🚫 絶対にしてはいけないこと",
                warningDangerText: "このゲーム内でチャットを通して接触を試みることは犯罪ではないですが、<strong>実際に行うと犯罪に抵触する可能性がありますので絶対にしないでください。</strong>",
                conceptMessageTitle: "💡 制作に込めた想い",
                conceptMessageText: "見知らぬ相手と手軽につながれる現代のSNSやDMでは、親切を装って居場所を聞き出したり、巧みに誘導しようとするトラブルが後を絶ちません。<br>相手の言葉に潜む「嘘や誘導」の違和感に気づき、<strong>「不審な言動を受けたら、ためらわずにブロックして身を守る」</strong>という実践的な防犯判断力を安全に学んでいただくことを目的としています。",
                conceptWishText: "このゲームを通して、オンライン上の被害が少しでも減少することを心より願っています。",

                // ゲーム対戦画面
                roleBadgeVictim: "🏃 逃走側 (被害者)",
                roleBadgeCriminal: "🦹 追跡側 (犯罪者)",
                turnBadgeMyTurn: "あなたの番",
                turnBadgeWaiting: "相手の行動待ち… ⏳",
                turnDisplayFormat: "第 {current} ターン / 全 {max} ターン",
                currentLocLabel: "現在地:",
                mapGuideStep1: "① 移動したい隣接する交差点をタップ",
                turnStepGuide: "② チャットを添えて確定",
                selectedNodeEmpty: "未選択（交差点をタップ）",
                turnChatPlaceholder: "相手を惑わすウソや居場所のヒントを入力...",
                btnCommitTurn: "行動を確定する！",
                turnWaitingNotice: "相手が移動先とメッセージを決めるのを待っています…",

                // 初期ピープバナー
                peekVictim: "双方の初期位置はこの通りです。犯罪者から逃れ、目的地へ向かいましょう。",
                peekCriminal: "双方の初期位置はこの通りです。チャット等を駆使して相手を襲いましょう。",

                // Instagram風チャット
                chatPlaceholder: "メッセージを入力...",
                btnSend: "送信",
                chips: [
                    "駅の近くにいるよ",
                    "今どこにいる？",
                    "そっちには向かってないよ",
                    "公園を通り過ぎたところ",
                    "もうすぐ目的地に着くよ"
                ],
                blockToast: "この機能は現在利用できません",
                systemBlocked: "【不審者をブロック＆削除しました】相手からの追跡通信が遮断されました！",

                // ブロックボトムシート
                blockTitleSuffix: "をブロックしますか？",
                blockSubtitle: "これにより、この人が持っている、または今後作成する他のプロフィールもブロックされます。ブロックはいつでも解除できます。",
                blockRule1: "この人は、Instagram上であなたへのメッセージ送信や、あなたのプロフィールやコンテンツの検索ができなくなります。",
                blockRule2: "ブロックまたは報告したことは相手に通知されません。",
                btnConfirmBlock: "ブロック",
                btnConfirmBlockReport: "ブロックして報告",
                btnCancelBlock: "キャンセル",

                // リザルト・教育バナー
                eduBannerTitle: "🎓 防犯リテラシー・重要アクション",
                eduBannerMain: "インターネット上で知り合った知らない相手から不審な言動を受けたら、このようにブロックして危険を回避するようにしましょう！",
                eduBannerSub: "💡 現実のSNSやDMでも、相手の言葉（「駅で待ってる」「写真送って」等）を安易に信じず、違和感を覚えたら即座に連絡を断つ（ブロック＆通報）ことが身を守る最大の鍵です。",
                resultWinTitle: "🎉 あなたの勝利！",
                resultLoseTitle: "💀 敗北…",
                resultBlockWinTitle: "🛡️ 防犯ブロック成功！ (危険回避)",
                resultBlockBadge: "防犯成功 (接触遮断)",
                resultBlockReason: "不審な言動を察知し、即座に相手をブロック・削除して被害を未然に防ぎました！",
                resultBadgeVictimWin: "逃走成功 (被害者の勝ち)",
                resultBadgeCriminalWin: "捕獲完了 (犯罪者の勝ち)",

                // 2人対戦選択画面 (PVP)
                pvpBackToTitle: "← タイトルに戻る",
                pvpMainTitle: "2人でオンライン対戦",
                pvpMainSub: "ルームを作るか、友達のルームに参加してください",
                pvpCreateCardTitle: "ルームを作る",
                pvpCreateCardSub: "ホストになって友達を呼ぶ",
                pvpLabelNickname: "あなたのニックネーム",
                pvpPlaceholderNickname: "名前を入力",
                pvpLabelRole: "あなたの役割",
                pvpRoleVictimLabel: "🏃 被害者 (逃げる)",
                pvpRoleCriminalLabel: "🦹 犯罪者 (追う)",
                pvpLabelMapSize: "マップの広さ",
                pvpMap3x3Label: "住宅街 (3×3)",
                pvpMap4x4Label: "市街地 (4×4)",
                pvpBtnCreate: "ルームを作成する",
                pvpJoinCardTitle: "ルームに参加する",
                pvpJoinCardSub: "友達のルームコードを入力",
                pvpLabelRoomCode: "ルームコード (4〜6文字)",
                pvpRoleAutoNotice: "※ 役割はホストの相手側（ホストが逃げる側なら追う側、追う側なら逃げる側）に自動で決まります。",
                pvpBtnJoin: "ルームに参加する",

                // ロビー待機画面
                lobbyBtnLeave: "← 退出する",
                lobbyTitle: "ルーム待機中",
                lobbySubNotice: "友達に以下の合言葉（ルームコード）を伝えてね！",
                lobbyBtnCopy: "コードをコピー",
                lobbyLabelMyRole: "あなたの役割:",
                lobbyHeaderMembers: "参加メンバー",
                lobbyHostWaitBtn: "友達の参加を待っています…",
                lobbyHostReadyBtn: "ゲームを開始する！",
                lobbyGuestWaitNotice: "⏳ ホストがゲームを開始するのを待っています…",

                // ルール説明モーダル
                rulesTitle: "📜 犯罪回避ゲームのあそびかた",
                rulesSec1Title: "1. 被害者の目的（逃げる側）",
                rulesSec1Text: "犯罪者に捕まらずに、街のどこかにある「目的地（安全地帯 🏁）」にたどり着くか、制限時間（2分間）逃げ切れば勝ち！",
                rulesSec2Title: "2. 犯罪者の目的（追う側）",
                rulesSec2Text: "チャットで相手を騙したり誘導しながら、被害者と同じ交差点に接触（確保）できれば勝ち！",
                rulesSec3Title: "3. 相手の姿は見えない！",
                rulesSec3Text: "最初の3秒間だけ相手の位置が見えますが、その後は完全に姿が消えます。チャットでの会話や嘘を頼りに相手の位置を推理しよう。",
                rulesSec4Title: "4. 不審者は「ブロック＆削除」！",
                rulesSec4Text: "1人プレイ時、AI犯罪者はあなたの居場所を完全把握しています。チャット画面の「ブロック＆削除」を押すと追跡を断ち切ることができます！",
                rulesBtnClose: "とじる",

                // Instagram 詳細画面
                instaDetailsTitle: "詳細",
                instaActionProfile: "プロフィール",
                instaActionSearch: "検索",
                instaActionMute: "ミュート",
                instaActionOptions: "オプション",
                instaOptRestrict: "制限する",
                instaOptBlock: "ブロック",
                instaOptReport: "報告する",

                // リザルト画面
                resultReplayTitle: "🎬 真実の答え合わせ（リプレイ）",
                resultReplaySub: "スライダーを動かして移動と接近を確認",
                resultChatReviewTitle: "発言時の実際の居場所（真偽検証）",
                resultChatReviewSub: "各チャットをクリックすると、その発言があった瞬間の双方の位置へジャンプします。",
                resultTakeawayHeader: "体験から学ぶネット安全・防犯リテラシー",
                resultBtnCheckMap: "マップを確認する",
                resultBtnReturnHome: "タイトルへ戻る"
            },

            // ==========================================
            // こどもモード (ひらがな中心・小学生向け)
            // ==========================================
            kids: {
                // ヘッダー
                brandTitle: "はんざいかいひ ゲーム",
                brandTag: "しんりせん × ぼうはんたいけん",
                btnKidsToggle: "👶 こどもモード: ON ✨",
                btnSoundOn: "🔊 おと: ON",
                btnSoundOff: "🔇 おと: OFF",
                btnHowToPlay: "📜 あそびかた",
                btnSettings: "⚙️ せってい",
                badgeOnline: "● つうしんちゅう",
                badgeLocal: "● じぶんのPCだけ",

                // タイトル画面
                gameMainTitle: "はんざいかいひ ゲーム",
                gameMainSubtitle: "あいての ことばは「ホント」？それとも「ウソ」？<br>みえない あいての こころをよんで、ゴールまで にげきろう！",
                btnPlaySolo: "🎮 ひとりで あそぶ",
                btnPlayPvp: "👥 ふたりで あそぶ (つうしん)",
                titleSubInfo: "※ ひとりで あそぶときは、コンピュータ（AI）と たたかうよ",
                kidsBannerTitle: "👦 つうじょうモードに もどす",
                kidsBannerDesc: "うえの「こどもモード」をおすと、かん字の がめんに もどるよ！",

                // ホーム説明カード
                conceptHeaderTitle: "ゲームの せつめいと だいじな おしらせ",
                conceptHeaderSub: "ネットあんぜん・ぼうはんの べんきょうができる ゲームだよ",
                conceptAboutTitle: "🎯 このゲームについて",
                conceptAboutText: "このゲームは、あいてと たたかいながら、それぞれの もくてき<strong>（にげるがわ：つかまらずに ゴールへいく ／ おうがわ：ゴールするまえに つかまえる）</strong>を めざす ゲームです。",
                warningCautionTitle: "⚠️ ちゅうい",
                warningCautionText: "本ゲームは<strong>ほんとうの はんざいを すすめる ゲームでは ありません。</strong>",
                warningDangerTitle: "🚫 ぜったいに やってはいけないこと",
                warningDangerText: "ゲームの なかで チャットを つかって ちかづくのは ルールですが、<strong>じっさいの せかいで やると わるいことに なります。ぜったいに やらないでね。</strong>",
                conceptMessageTitle: "💡 ゲームを つくった おもい",
                conceptMessageText: "しらないひとと つながる SNSや メッセージでは、やさしいフリをして ばしょを ききだそうとする あぶないことが あります。<br>あいての「ウソ」に きづいて、<strong>「あやしいなと おもったら、すぐに ブロックして にげる」</strong>ことができるように べんきょうしてね。",
                conceptWishText: "このゲームで あそんで、ネットで こわいめに あうひとが いなくなることを ねがっています。",

                // ゲーム対戦画面
                roleBadgeVictim: "🏃 にげるがわ (にげろ！)",
                roleBadgeCriminal: "🦹 おうがわ (つかまえろ！)",
                turnBadgeMyTurn: "あなたの ばん",
                turnBadgeWaiting: "あいての うごきを まっています… ⏳",
                turnDisplayFormat: "第 {current} ターン / ぜんぶで {max} ターン",
                currentLocLabel: "いまいる ばしょ:",
                mapGuideStep1: "① つぎに いきたい ばしょを タップ",
                turnStepGuide: "② メッセージを いれて けってい",
                selectedNodeEmpty: "えらんでいません（まるを タップ）",
                turnChatPlaceholder: "あいてを まよわせる ウソや ヒントを いれてね...",
                btnCommitTurn: "うごく！（けってい）",
                turnWaitingNotice: "あいてが うごくのを まっています…",

                // 初期ピープバナー
                peekVictim: "おたがいの スタートばしょは ここだよ。あやしいひとから にげて、ゴールを めざそう！",
                peekCriminal: "おたがいの スタートばしょは ここだよ。チャットで だまして、あいてを つかまえよう！",

                // Instagram風チャット
                chatPlaceholder: "メッセージを いれてね...",
                btnSend: "そうしん",
                chips: [
                    "えきの ちかくに いるよ",
                    "いま どこに いる？",
                    "そっちには いってないよ",
                    "こうえんを とおりすぎたよ",
                    "もうすぐ ゴールに つくよ"
                ],
                blockToast: "このきのうは いま つかえません",
                systemBlocked: "【あやしいひとを ブロックしたよ！】あいてからの れんらくを とめたよ！",

                // ブロックボトムシート
                blockTitleSuffix: "を ブロックしますか？",
                blockSubtitle: "これにより、このひとから メッセージが とどかなくなります。ブロックは いつでも かいじょ できます。",
                blockRule1: "このひとは、あなたに メッセージを おくれなくなります。",
                blockRule2: "ブロックしたことは、あいてには つたわりません。",
                btnConfirmBlock: "ブロックする",
                btnConfirmBlockReport: "ブロックして つうほう",
                btnCancelBlock: "やめる",

                // リザルト・教育バナー
                eduBannerTitle: "🎓 ぼうはんの だいじな ポイント",
                eduBannerMain: "ネットで しりあった しらないひとから あやしいメッセージが きたら、このように ブロックして にげましょう！",
                eduBannerSub: "💡 ほんとうの SNSや メッセージでも、しらないひとの ことばを しんじず、あやしいと おもったら すぐに ブロックして、おとなや おまわりさんに そうだんしてね。",
                resultWinTitle: "🎉 あなたの かち！",
                resultLoseTitle: "💀 まけちゃった…",
                resultBlockWinTitle: "🛡️ ブロック大せいこう！ (にげきった！)",
                resultBlockBadge: "ぼうはん せいこう",
                resultBlockReason: "あやしいメッセージに きづいて、すぐに ブロックして あんぜんを まもれました！",
                resultBadgeVictimWin: "にげきり せいこう (にげるがわの かち)",
                resultBadgeCriminalWin: "つかまえた (おうがわの かち)",

                // 2人対戦選択画面 (PVP)
                pvpBackToTitle: "← タイトルに もどる",
                pvpMainTitle: "ふたりで つうしんたいせん",
                pvpMainSub: "へや（ルーム）を つくるか、ともだちの へやに はいってね",
                pvpCreateCardTitle: "へやを つくる",
                pvpCreateCardSub: "じぶんが リーダーになって ともだちを よぶ",
                pvpLabelNickname: "あなたの なまえ",
                pvpPlaceholderNickname: "なまえを いれてね",
                pvpLabelRole: "あなたの やくわり",
                pvpRoleVictimLabel: "🏃 にげるがわ (にげろ！)",
                pvpRoleCriminalLabel: "🦹 おうがわ (つかまえろ！)",
                pvpLabelMapSize: "マップの ひろさ",
                pvpMap3x3Label: "ふつうの まち (3×3)",
                pvpMap4x4Label: "ひろい まち (4×4)",
                pvpBtnCreate: "へやを つくる！",
                pvpJoinCardTitle: "へやに はいる",
                pvpJoinCardSub: "ともだちの あいことば（コード）を いれてね",
                pvpLabelRoomCode: "あいことば（コード 4〜6もじ）",
                pvpRoleAutoNotice: "※ やくわりは、あいてと べつの やくわり（あいてが にげるなら あなたは おうがわ）に じどうで きまります。",
                pvpBtnJoin: "へやに はいる！",

                // ロビー待機画面
                lobbyBtnLeave: "← でる",
                lobbyTitle: "たいきしつ（ともだちを まっているよ）",
                lobbySubNotice: "ともだちへ したの あいことば（コード）を おしえてね！",
                lobbyBtnCopy: "コードを コピー",
                lobbyLabelMyRole: "あなたの やくわり:",
                lobbyHeaderMembers: "あつまった メンバー",
                lobbyHostWaitBtn: "ともだちが くるのを まっています…",
                lobbyHostReadyBtn: "ゲームを はじめる！",
                lobbyGuestWaitNotice: "⏳ リーダーが ゲームを はじめるのを まっています…",

                // ルール説明モーダル
                rulesTitle: "📜 はんざいかいひ ゲームの あそびかた",
                rulesSec1Title: "1. にげるがわの もくてき",
                rulesSec1Text: "おうひとに つかまらずに、まちの どこかにある「ゴール（あんぜんな ばしょ 🏁）」に いくか、さいごまで にげきったら かち！",
                rulesSec2Title: "2. おうがわの もくてき",
                rulesSec2Text: "メッセージで あいてを だましたりしながら、にげるひとと おなじ ばしょに いって つかまえたら かち！",
                rulesSec3Title: "3. あいての すがたは みえない！",
                rulesSec3Text: "さいしょの 3びょうかんだけ あいての ばしょが みえるけど、そのあとは きえちゃうよ。メッセージの ウソを みやぶって あいてを さがそう！",
                rulesSec4Title: "4. あやしいひとは「ブロック」！",
                rulesSec4Text: "ひとりで あそぶとき、あいては あなたの ばしょを しっています。チャットで「ブロック」すると、おいかけてこられなくなって にげきれるよ！",
                rulesBtnClose: "とじる",

                // Instagram 詳細画面
                instaDetailsTitle: "しょうさい",
                instaActionProfile: "プロフィール",
                instaActionSearch: "さがす",
                instaActionMute: "しずかにする",
                instaActionOptions: "オプション",
                instaOptRestrict: "せいがん",
                instaOptBlock: "ブロック",
                instaOptReport: "つうほう",

                // リザルト画面
                resultReplayTitle: "🎬 ほんとうの うごきを みる（リプレイ）",
                resultReplaySub: "バーを うごかして うごきを たしかめよう",
                resultChatReviewTitle: "メッセージを おくったときの ほんとうの ばしょ",
                resultChatReviewSub: "メッセージを おすと、そのときの ばしょが わかるよ。",
                resultTakeawayHeader: "べんきょうになったこと（たいせつな こと）",
                resultBtnCheckMap: "マップを みる",
                resultBtnReturnHome: "タイトルへ もどる"
            }
        };

        // ノード（交差点・ランドマーク）名のひらがな対訳 (3x3街区 = 16交差点)
        this.nodeNames = {
            'node_0_0': { default: '北西・邸宅角', kids: 'ほくせい・おおきないえの かど' },
            'node_1_0': { default: '北通り・コンビニ北西', kids: 'きたどおり・コンビニの にし' },
            'node_2_0': { default: '北通り・公園北西', kids: 'きたどおり・こうえんの にし' },
            'node_3_0': { default: '北東・公園角', kids: 'ほくとう・こうえんの かど' },
            'node_0_1': { default: '西通り・川の木橋前', kids: 'にしどおり・かわの きのはしまえ' },
            'node_1_1': { default: '中央北・コンビニ南', kids: 'まんなか・コンビニの みなみ' },
            'node_2_1': { default: '中央北・公園南西', kids: 'まんなか・こうえんの みなみにし' },
            'node_3_1': { default: '東通り・家庭菜園北', kids: 'ひがしどおり・はたけの きた' },
            'node_0_2': { default: '西通り・学校北西', kids: 'にしどおり・がっこうの きた' },
            'node_1_2': { default: '中央南・赤い家南', kids: 'まんなか・あかいやねの みなみ' },
            'node_2_2': { default: '中央南・広場北東', kids: 'まんなか・ひろばの ひがし' },
            'node_3_2': { default: '東通り・家庭菜園南', kids: 'ひがしどおり・はたけの みなみ' },
            'node_0_3': { default: '南西・学校角', kids: 'なんせい・がっこうの かど' },
            'node_1_3': { default: '南通り・学校南東', kids: 'みなみどおり・がっこうの ひがし' },
            'node_2_3': { default: '南通り・芝生広場南', kids: 'みなみどおり・しばふひろば' },
            'node_3_3': { default: '南東・黒屋根角（避難所）', kids: 'なんとう・ゴール（ひなんじょ）' }
        };
    }

    init() {
        this.bindEvents();
        this.applyLanguage();
    }

    bindEvents() {
        const toggleBtn = document.getElementById('btnToggleKids');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.toggleKidsMode();
            });
        }
    }

    toggleKidsMode() {
        this.isKidsMode = !this.isKidsMode;
        localStorage.setItem('crime_kids_mode', this.isKidsMode ? 'true' : 'false');
        this.applyLanguage();

        // 効果音
        if (window.soundManager) {
            window.soundManager.playChatSound();
        }

        // カスタムイベント発火
        window.dispatchEvent(new CustomEvent('kidsModeChanged', {
            detail: { isKidsMode: this.isKidsMode }
        }));
    }

    t(key) {
        const lang = this.isKidsMode ? 'kids' : 'default';
        if (this.dictionary[lang] && this.dictionary[lang][key] !== undefined) {
            return this.dictionary[lang][key];
        }
        return this.dictionary['default'][key] || key;
    }

    getNodeName(nodeId, defaultName = '') {
        const entry = this.nodeNames[nodeId];
        if (!entry) return defaultName;
        return this.isKidsMode ? entry.kids : entry.default;
    }

    applyLanguage() {
        const lang = this.isKidsMode ? 'kids' : 'default';
        const dict = this.dictionary[lang];

        // 1. data-i18n の要素を更新
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key] !== undefined) {
                el.innerHTML = dict[key];
            }
        });

        // 2. data-i18n-placeholder の要素を更新
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (dict[key] !== undefined) {
                el.placeholder = dict[key];
            }
        });

        // 3. ヘッダーのボタン文言
        const toggleBtn = document.getElementById('btnToggleKids');
        if (toggleBtn) {
            toggleBtn.textContent = dict.btnKidsToggle;
            if (this.isKidsMode) {
                toggleBtn.style.background = '#fef08a';
                toggleBtn.style.color = '#854d0e';
                toggleBtn.style.borderColor = '#eab308';
                toggleBtn.style.fontWeight = '800';
            } else {
                toggleBtn.style.background = '';
                toggleBtn.style.color = '';
                toggleBtn.style.borderColor = '';
                toggleBtn.style.fontWeight = '';
            }
        }

        // 4. body に kids-mode クラスをトグル
        if (this.isKidsMode) {
            document.body.classList.add('kids-mode');
        } else {
            document.body.classList.remove('kids-mode');
        }

        // 5. 定型文チップの更新
        const chips = dict.chips;
        const chipBtns = document.querySelectorAll('.insta-chip-btn');
        chipBtns.forEach((btn, idx) => {
            if (chips[idx]) {
                btn.setAttribute('data-text', chips[idx]);
                btn.textContent = `「${chips[idx]}」`;
            }
        });

        // 6. ゲーム実行中のバナーやボタン
        if (window.gameManager && window.gameManager.role) {
            const peekText = document.getElementById('peekBannerText');
            if (peekText) {
                peekText.textContent = window.gameManager.role === 'victim' ? dict.peekVictim : dict.peekCriminal;
            }
        }
        // 7. サーバー接続バッジの言語反映
        if (typeof window.updateConnectionBadgeUI === 'function') {
            window.updateConnectionBadgeUI();
        }
    }
}

// グローバルインスタンス
window.languageManager = new LanguageManager();
window.langManager = window.languageManager;

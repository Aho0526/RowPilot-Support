# -*- coding: utf-8 -*-
"""
Translations for support, terms, privacy-policy, and news pages.
"""

PAGE_TITLES = {
    'support': {
        'de': ('Support & Hilfe | RowPilot', 'Hilfeseite für die RowPilot Ruder-App. Häufig gestellte Fragen (FAQ), PM5-Verbindungshilfe und Kontakt zum Entwickler.'),
        'fr': ('Support & Assistance | RowPilot', 'Centre d\'aide RowPilot. Foire aux questions (FAQ), guide de connexion Concept2 PM5 et formulaire de contact.'),
        'es': ('Centro de Soporte | RowPilot', 'Ayuda y soporte para la app RowPilot. Preguntas frecuentes (FAQ), guía de conexión PM5 y contacto directo.'),
        'it': ('Centro Supporto | RowPilot', 'Assistenza e FAQ per l\'app RowPilot. Risoluzione problemi Bluetooth PM5, gestione dati e supporto tecnico.'),
        'zh': ('技术支持与帮助中心 | RowPilot', 'RowPilot 赛艇App帮助中心。包含常见问题解答 (FAQ)、Concept2 PM5 蓝牙连接指南及开发团队联络方式。'),
        'ko': ('고객지원 및 도움말 | RowPilot', 'RowPilot 조정 앱 지원 센터. 자주 묻는 질문(FAQ), Concept2 PM5 연결 가이드 및 개발팀 문의 안내.')
    },
    'terms': {
        'de': ('Nutzungsbedingungen | RowPilot', 'Nutzungsbedingungen für die Nutzung der RowPilot iOS-Applikation und zugehöriger Dienste.'),
        'fr': ('Conditions d\'Utilisation | RowPilot', 'Conditions générales d\'utilisation de l\'application iOS RowPilot et des services associés.'),
        'es': ('Términos de Servicio | RowPilot', 'Términos y condiciones para el uso de la aplicación RowPilot y sus servicios asociados.'),
        'it': ('Termini di Servizio | RowPilot', 'Termini e condizioni per l\'utilizzo dell\'applicazione iOS RowPilot.'),
        'zh': ('用户使用条款 | RowPilot', 'RowPilot 应用程序及相关服务的使用条款与法律协议。'),
        'ko': ('이용약관 | RowPilot', 'RowPilot iOS 애플리케이션 및 관련 서비스 이용약관.')
    },
    'privacy': {
        'de': ('Datenschutzerklärung | RowPilot', 'Informationen zur Erhebung, Speicherung und zum Schutz Ihrer Daten in RowPilot.'),
        'fr': ('Politique de Confidentialité | RowPilot', 'Détails sur la collecte, l\'utilisation et la protection de vos données personnelles sur RowPilot.'),
        'es': ('Política de Privacidad | RowPilot', 'Información sobre el tratamiento, seguridad y protección de datos en la app RowPilot.'),
        'it': ('Informativa sulla Privacy | RowPilot', 'Informativa sul trattamento e la protezione dei dati personali nell\'app RowPilot.'),
        'zh': ('隐私保护政策 | RowPilot', 'RowPilot 应用程序关于数据采集、权限调取、数据存储与隐私保护的详细声明。'),
        'ko': ('개인정보처리방침 | RowPilot', 'RowPilot 앱의 위치정보, 블루투스 데이터 수집 및 안전한 정보 관리에 관한 안내.')
    },
    'news': {
        'de': ('Neuigkeiten & Updates | RowPilot', 'Aktuelle Ankündigungen, Versionshinweise und Preisupdates für RowPilot.'),
        'fr': ('Actualités & Mises à Jour | RowPilot', 'Annonces officielles, notes de version et évolutions tarifaires de RowPilot.'),
        'es': ('Noticias y Actualizaciones | RowPilot', 'Anuncios oficiales, novedades y actualizaciones de planes de RowPilot.'),
        'it': ('Novità e Aggiornamenti | RowPilot', 'Ultime novità, aggiornamenti sulle funzionalità e comunicazioni ufficiali di RowPilot.'),
        'zh': ('官方动态与公告 | RowPilot', 'RowPilot 官方最新动态、功能升级、版本发布与公告。'),
        'ko': ('공지사항 및 업데이트 | RowPilot', 'RowPilot 공식 공지사항, 기능 업데이트 및 요금제 개정 안내.')
    }
}

SUPPORT_CONTENT = {
    'de': {
        'heading': 'Support & Kontakt',
        'sub': 'Haben Sie Fragen zur Bedienung, Fehlerberichte oder Anregungen zu neuen Funktionen?<br>Unser Entwicklerteam hilft Ihnen gerne weiter.',
        'note': 'Für Anfragen bezüglich Spenden oder Sponsoring wenden Sie sich bitte ebenfalls an diese Adresse.',
        'faq_title': 'Häufig gestellte Fragen (FAQ)',
        'faq_sub': 'Hier finden Sie schnelle Antworten auf die wichtigsten Fragen zur Einrichtung und Nutzung.',
        'cat_conn': 'Bluetooth & Verbindung',
        'q_pm5': 'Ich kann mich nicht über Bluetooth mit dem Concept2 PM5 verbinden.',
        'a_pm5': '<p>Bitte überprüfen Sie folgende Schritte der Reihe nach:</p><ol><li>Öffnen Sie im PM5-Menü <strong>„Connect“ &rarr; „Wireless“</strong>, um die Drahtlosverbindung zu aktivieren.</li><li>Stellen Sie sicher, dass RowPilot in den iOS-Einstellungen unter <em>Datenschutz & Sicherheit &rarr; Bluetooth</em> freigegeben ist.</li><li>Starten Sie den Scan im Trainings-Tab von RowPilot. Das PM5 sollte in der Geräteliste erscheinen.</li><li>Schalten Sie bei Verbindungsabbrüchen andere Bluetooth-Geräte in der Nähe vorübergehend aus.</li><li>Halten Sie die Firmware Ihres PM5 stets auf dem neuesten Stand.</li></ol>',
        'cat_data': 'Daten & Sicherung',
        'q_data': 'Wo werden meine Trainingsdaten gespeichert?',
        'a_data': '<p>Ihre Trainingseinheiten werden standardmäßig lokal auf Ihrem iPhone gespeichert. Bei Nutzung von Team-Tarifen werden Teamstatistiken zusätzlich über eine sichere Datenbank (Cloudflare D1) synchronisiert.</p>'
    },
    'fr': {
        'heading': 'Centre d\'Assistance',
        'sub': 'Une question sur l\'utilisation, un rapport de bug ou une suggestion d\'amélioration ?<br>Notre équipe vous répond dans les plus brefs délais.',
        'note': 'Pour toute demande de partenariat ou de sponsoring, vous pouvez également nous contacter à cette adresse.',
        'faq_title': 'Foire Aux Questions (FAQ)',
        'faq_sub': 'Consultez ici les solutions aux questions les plus fréquentes.',
        'cat_conn': 'Bluetooth & Connexion',
        'q_pm5': 'Impossible de connecter le moniteur Concept2 PM5 en Bluetooth.',
        'a_pm5': '<p>Veuillez suivre ces étapes dans l\'ordre :</p><ol><li>Sur le PM5, allez dans <strong>« Connect » &rarr; « Wireless »</strong> pour activer le Bluetooth.</li><li>Vérifiez dans les réglages iOS (Confidentialité & Sécurité &rarr; Bluetooth) que l\'accès est autorisé pour RowPilot.</li><li>Lancez la recherche d\'appareils dans l\'onglet Entraînement de l\'application.</li><li>Éloignez ou éteignez les autres appareils Bluetooth à proximité en cas d\'interférences.</li><li>Assurez-vous que le firmware de votre PM5 est à jour.</li></ol>',
        'cat_data': 'Données & Sauvegarde',
        'q_data': 'Où sont stockées mes données d\'entraînement ?',
        'a_data': '<p>Vos données sont enregistrées localement sur votre iPhone. Si vous activez la synchronisation d\'équipe (à partir du forfait Team), les données sont également synchronisées sur notre base de données sécurisée (Cloudflare D1).</p>'
    },
    'es': {
        'heading': 'Atención al Usuario',
        'sub': '¿Tienes preguntas sobre el uso, sugerencias o deseas reportar un error?<br>Te responderemos a la mayor brevedad posible.',
        'note': 'Para consultas sobre patrocinios o donaciones a clubes náuticos, puedes escribirnos aquí.',
        'faq_title': 'Preguntas Frecuentes (FAQ)',
        'faq_sub': 'Consulta primero esta sección para resolver tus dudas rápidamente.',
        'cat_conn': 'Bluetooth y Conectividad',
        'q_pm5': 'No consigo conectar con el monitor Concept2 PM5 por Bluetooth.',
        'a_pm5': '<p>Por favor, realiza las siguientes comprobaciones:</p><ol><li>En el menú de tu PM5, selecciona <strong>"Connect" &rarr; "Wireless"</strong> para encender el Bluetooth.</li><li>Verifica en Ajustes de iOS &rarr; Privacidad y Seguridad &rarr; Bluetooth que RowPilot tenga permiso.</li><li>Inicia el escaneo en la pestaña de Entrenamiento de RowPilot; el PM5 aparecerá en la lista.</li><li>Si la señal es inestable, apaga temporalmente otros dispositivos Bluetooth cercanos.</li><li>Asegúrate de tener actualizado el firmware del PM5 a su versión más reciente.</li></ol>',
        'cat_data': 'Datos y Almacenamiento',
        'q_data': '¿Dónde se guardan mis entrenamientos?',
        'a_data': '<p>Los registros se guardan localmente en la memoria de tu dispositivo. En los planes de equipo, las estadísticas también se sincronizan de forma segura en la nube (Cloudflare D1).</p>'
    },
    'it': {
        'heading': 'Supporto Tecnico',
        'sub': 'Hai domande sull\'utilizzo, suggerimenti o vuoi segnalare un problema?<br>Il nostro team ti risponderà nel più breve tempo possibile.',
        'note': 'Per richieste di collaborazione o supporto a circoli remieri, scrivici a questo indirizzo.',
        'faq_title': 'Domande Frequenti (FAQ)',
        'faq_sub': 'Trova rapidamente risposta alle domande più comuni.',
        'cat_conn': 'Bluetooth e Connessione',
        'q_pm5': 'Non riesco a connettere il Concept2 PM5 via Bluetooth.',
        'a_pm5': '<p>Segui questi passaggi nell\'ordine indicato:</p><ol><li>Sul monitor PM5 entra in <strong>"Connect" &rarr; "Wireless"</strong> per attivare la trasmissione.</li><li>Verifica in Impostazioni iOS &rarr; Privacy & Sicurezza &rarr; Bluetooth che RowPilot sia autorizzato.</li><li>Avvia la scansione nella scheda Allenamento; il PM5 comparirà nell\'elenco dei dispositivi.</li><li>In caso di interferenze, disattiva temporaneamente altri apparecchi Bluetooth vicini.</li><li>Controlla che il firmware del monitor PM5 sia aggiornato all\'ultima versione.</li></ol>',
        'cat_data': 'Dati e Backup',
        'q_data': 'Dove vengono salvati i miei dati?',
        'a_data': '<p>I dati di allenamento sono salvati nella memoria del tuo iPhone. Per gli utenti con piani Team, le statistiche vengono sincronizzate in cloud su server protetti (Cloudflare D1).</p>'
    },
    'zh': {
        'heading': '服务与技术支持',
        'sub': '如果您在使用中遇到问题、希望提出功能建议或反馈 Bug，<br>请随时与我们联系，我们将尽快为您解答。',
        'note': '关于赛艇俱乐部合作或赞助事宜，亦欢迎随时来信垂询。',
        'faq_title': '常见问题解答 (FAQ)',
        'faq_sub': '遇到使用疑问？请先在此查阅快速解决方案。',
        'cat_conn': '蓝牙与设备连接',
        'q_pm5': '无法通过蓝牙连接 Concept2 PM5 测功仪？',
        'a_pm5': '<p>请按以下顺序排查：</p><ol><li>在 PM5 仪表主菜单中选择 <strong>"Connect" &rarr; "Wireless"</strong> 开启无线通讯。</li><li>前往 iOS 设置 &rarr; 隐私与安全性 &rarr; 蓝牙，确保已允许 RowPilot 访问蓝牙权限。</li><li>在 RowPilot 应用内的“训练”标签页中点击扫描，设备列表中将出现对应 PM5。</li><li>如信号不稳定，请尝试移开或关闭周围其他干扰蓝牙设备。</li><li>请确保 PM5 仪表已升级至官方最新固件版本。</li></ol>',
        'cat_data': '数据管理与备份',
        'q_data': '我的训练数据存放在哪里？',
        'a_data': '<p>RowPilot 的划行数据默认安全保存在您的本地 iPhone 设备上。当启用团队计划时，团队训练统计数据将安全同步至云端数据库 (Cloudflare D1)。</p>'
    },
    'ko': {
        'heading': '고객지원 및 문의',
        'sub': '앱 사용법 문의, 버그 제보, 기능 개선 제안 등 언제든지 문의해 주세요.<br>확인 후 신속히 답변해 드리겠습니다.',
        'note': '로잉 팀 협업 및 단체 후원 문의도 본 메일로 접수하고 있습니다.',
        'faq_title': '자주 묻는 질문 (FAQ)',
        'faq_sub': '궁금한 점이 있으시다면 먼저 FAQ를 확인해 보세요.',
        'cat_conn': '블루투스 및 기기 연결',
        'q_pm5': 'Concept2 PM5 모니터와 블루투스 연결이 되지 않습니다.',
        'a_pm5': '<p>아래 순서대로 점검해 주시기 바랍니다:</p><ol><li>PM5 모니터 메뉴에서 <strong>"Connect" &rarr; "Wireless"</strong>를 선택하여 무선 통신을 활성화합니다.</li><li>iOS 설정 &rarr; 개인정보 보호 및 보안 &rarr; Bluetooth에서 RowPilot 접근 권한이 켜져 있는지 확인합니다.</li><li>RowPilot의 훈련 탭에서 검색을 시작하면 장치 목록에 PM5가 표시됩니다.</li><li>연결이 불안정할 경우 주변의 다른 블루투스 기기 전원을 잠시 끄거나 멀리 떨어뜨려 보세요.</li><li>PM5 모니터의 펌웨어가 최신 버전인지 확인해 주세요.</li></ol>',
        'cat_data': '데이터 및 백업',
        'q_data': '측정된 훈련 데이터는 어디에 저장되나요?',
        'a_data': '<p>모든 운동 기록은 기본적으로 사용자의 iPhone 기기 내에 안전하게 저장됩니다. 팀 요금제를 활성화한 경우 크루 기록 통계가 안전한 클라우드 데이터베이스(Cloudflare D1)와 동기화됩니다.</p>'
    }
}

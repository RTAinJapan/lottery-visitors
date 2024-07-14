"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const csv_parse_1 = require("csv-parse");
const commander_1 = require("commander");
const promises_1 = require("stream/promises");
const sync_1 = require("csv-stringify/sync");
// CLIコマンドをパース
const program = new commander_1.Command();
program
    .option('-f, --fileName <fileName>', "ファイル名指定", "data.csv")
    .option('-a --add <add>', "優先度列の前に追加しているデータ列数(note IDなど)", "0")
    .option('-h --header', "1行目をデータ行として含めるか")
    .parse(process.argv);
const options = program.opts();
const EMAIL_COLUMN = 1;
const CANCEL_STRING = 'これをチェック状態にすると、入場登録をキャンセルしたとみなされます';
const IGNORE_STRINGS = [
    CANCEL_STRING,
    '該当なし',
];
// Setオブジェクトに優先度データを追加(Setオブジェクトを使うことで重複削除)
const addPrioritiesToSet = (set, row) => {
    const priorities = row.slice(2 + parseInt(options.add));
    // 不要なデータを除去して追加
    priorities.map((date) => !date || IGNORE_STRINGS.some(str => date.includes(str)) ? null : set.add(date));
};
// CSVを読み込む
const readCSV = async (fileName, startLine) => {
    const csvData = {};
    const eventDate = new Set();
    const parser = (0, fs_1.createReadStream)(`./${fileName}`)
        .pipe((0, csv_parse_1.parse)({ from: startLine }));
    parser.on('data', (row) => {
        if (row.some((data) => data.includes(CANCEL_STRING))) {
            return;
        }
        // indexをメールアドレスにすることで重複削除(後ろ優先)
        csvData[row[EMAIL_COLUMN]] = row;
        // 優先度データからイベント開催日時を追加
        addPrioritiesToSet(eventDate, row);
    })
        .on("error", err => {
        throw Error(err.message);
    });
    await (0, promises_1.finished)(parser);
    return { csvData, eventDate };
};
// 配列のシャッフル処理
// https://qiita.com/pure-adachi/items/77fdf665ff6e5ea22128
const shuffleArray = (array) => {
    for (let i = array.length; 1 < i; i--) {
        const key = Math.floor(Math.random() * i);
        [array[key], array[i - 1]] = [array[i - 1], array[key]];
    }
};
// メイン処理
(async () => {
    try {
        const startLine = options.header ? 1 : 2;
        const { csvData, eventDate } = await readCSV(options.fileName, startLine);
        // 結果データの初期化
        const result = [];
        eventDate.forEach((date) => {
            const data = [];
            for (let i = 1; i <= eventDate.size; i++) {
                data.push({ priority: i, users: [] });
            }
            result.push({ date, data });
        });
        Object.values(csvData).forEach((row) => {
            const priorities = new Set();
            addPrioritiesToSet(priorities, row);
            let i = 1;
            for (const priority of priorities) {
                result.find((r) => r.date === priority)
                    ?.data.find((d) => d.priority === i)?.users.push({
                    email: row[EMAIL_COLUMN],
                    addData: row[1 + parseInt(options.add)],
                });
                i++;
            }
        });
        // 結果をシャッフル
        result.forEach((r) => {
            r.data.forEach((d) => {
                shuffleArray(d.users);
            });
        });
        // CSVを出力
        result.forEach((r) => {
            const date = r.date.match(/(\d+)\/(\d+)/);
            const month = date ? date[1] : '';
            const day = date ? date[2] : '';
            let users = [];
            r.data.forEach((d) => {
                users = users.concat(d.users);
            });
            const csvData = (0, sync_1.stringify)(users, { header: true });
            (0, fs_1.writeFileSync)(`./${month.padStart(2, '0')}${day.padStart(2, '0')}.csv`, csvData);
        });
    }
    catch (err) {
        console.error(err.message);
        process.exit(1);
    }
})();

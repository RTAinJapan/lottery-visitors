import { createReadStream, writeFileSync } from 'fs';
import { parse } from 'csv-parse';
import { Command } from 'commander';
import { finished } from 'stream/promises';
import { stringify } from 'csv-stringify/sync';

// CLIコマンドをパース
const program = new Command();
program
    .option('-f, --fileName <fileName>', "ファイル名指定", "data.csv")
    .option('-a --add <add>', "優先度列の前に追加しているデータ列数(note IDなど)", "0")
    .option('-h --header', "1行目をデータ行として含めるか")
    .parse(process.argv);

const options = program.opts();

type User = {
    name: string,
    email: string,
};

type Result = {
    date: string,
    data: {
        priority: number,
        users: User[]
    }[]
};

const EMAIL_COLUMN = 1;
const NAME_COLUMN = 2;

// Setオブジェクトに優先度データを追加(Setオブジェクトを使うことで重複削除)
const addPrioritiesToSet = (set: Set<string>, row: string[]) => {
    const priorities = row.slice(3 + parseInt(options.add));

    // 空白データを除去して追加
    priorities.map((date) => date ? set.add(date) : null);
}

// CSVを読み込む
const readCSV = async (fileName: string, startLine: number) => {
    const csvData: { [index: string]: string[] } = {};
    const eventDate = new Set<string>();

    const parser = createReadStream(`./${fileName}`)
        .pipe(parse({ from: startLine }));
    
    parser.on('data', (row: string[]) => {
        // indexをメールアドレスにすることで重複削除(後ろ優先)
        csvData[row[EMAIL_COLUMN]] = row;
        // 優先度データからイベント開催日時を追加
        addPrioritiesToSet(eventDate, row);
    })
    .on("error", err => {
        throw Error(err.message);
    });
    
    await finished(parser);
    return { csvData, eventDate };
}

// 配列のシャッフル処理
// https://qiita.com/pure-adachi/items/77fdf665ff6e5ea22128
const shuffleArray = (array: any[]) => {
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
        const result: Result[] = [];
        eventDate.forEach((date) => {
            const data: Result['data'] = [];
            for (let i = 1; i <= eventDate.size; i++) {
                data.push({ priority: i, users: [] });
            }
            result.push({ date, data });
        });

        Object.values(csvData).forEach((row) => {
            const priorities = new Set<string>();
            addPrioritiesToSet(priorities, row);
            let i = 1;
            for (const priority of priorities) {
                result.find((r) => r.date === priority)
                    ?.data.find((d) => d.priority === i)?.users.push({
                        name: row[NAME_COLUMN],
                        email: row[EMAIL_COLUMN],
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
            const [month, day] = r.date.split('/');
            let users: User[] = [];
            r.data.forEach((d) => {
                users = users.concat(d.users);
            });

            const csvData = stringify(users, { header: true });
            writeFileSync(`./${month.padStart(2, '0')}${day.padStart(2, '0')}.csv`, csvData);
        });
    } catch (err) {
        console.error((err as any).message);
        process.exit(1);
    }
})();
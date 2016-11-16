var path = require('path');
var http = require('http');
var iconv = require('iconv-lite');
var BufferHelper = require('bufferhelper');
var fs = require('fs');
//引用cheerio模块,使在服务器端像在客户端上操作DOM,不用正则表达式
var cheerio = require('cheerio');

var Program = {
    run: function(opts) {
        this._setOpts(opts);
        this._init();
        this._dateFormat();
    },
    // 小说下载完毕后执行
    callback: function() {
        console.log('--------下载完成后执行的回调方法--------');
    },
    // 章节抓取过程中执行（监听抓取过程）
    snatchCallback: function(chapter, progress) {
        console.log('--------监听抓取过程回调方法--------');
    },
    // 设置下载参数
    _setOpts: function(opts) {
        if(typeof opts == 'object') {
            this._bookId = opts.bookId;
            this._startChapter = opts.startChapter;
        }else{
            throw new Error('下载参数错误！');
        }
    },
    // 下载配置项
    _option: {
        base: 'http://www.boquge.com',
        book: ''
    },
    _bookId: null, // bookId
    _startChapter: null, // 开始章节名
    _isOk: true, // 标志当前章节是否已下载成功
    _list: [], // 小说列表
    _chapterNum: 0, // 需要抓取的总章节数
    _book: '', // 保存小说名
    getBook() { // 获取小说名
        return this._book;
    },
    _errorLog: '\r\n----------------------------------------\r\n', // 保存错误章节日志
    _outputDir: path.join(__dirname, '../data/'), // 小说输出路径
    _init: function() {
        var bookId = this._bookId,
            startChapterName = this._startChapter;

        var option = this._option;
        option.book = '/book/'+ bookId + '/';
        var bookListUrl = option.base + option.book;
        this._entry(bookListUrl, startChapterName);
    },
    // 章节抓取入口
    _entry: function(bookListUrl, startChapterName) {
        var _this = this;
        var req = http.request(bookListUrl, function(res) {
            //解决中文编码问题
            var bufferHelper = new BufferHelper();
            res.on('data', function(chunk) {
                bufferHelper.concat(chunk);
            });
            res.on('end', function() {
                //注意，此编码必须与抓取页面的编码一致，否则会出现乱码，也可以动态去识别
                var val = iconv.decode(bufferHelper.toBuffer(), 'gbk');
                var $ = cheerio.load(val);
                var book = $('h1').text().match(/^[\u4e00-\u9fa5]+/)[0] + ' ' + new Date().Format("yyyy-MM-dd");
                _this._book = book;
                var $links = $('#chapters-list').find('a');

                var list = _this._list;
                var isStart = false;
                if(!startChapterName){
                    isStart = true;
                }
                $links.each(function(index, item){
                	var chapter = {};
                	chapter.name = $(item).text();
                	chapter.href = $(item).attr('href');
                    if(chapter.name == startChapterName){
                        isStart = true;
                    }
                    if(isStart){
                        list.push(chapter);
                    }
                });
                // 统计需要下载的总章节数
                _this._chapterNum = list.length;
                // 调用，让它按队列顺序执行，以免章节错乱
                _this._excuteSnatchTxt();
            });
        }).on('error', function(e) {
            console.log(e.message);
        });
        req.end();
    },
    // 根据列表进行章节的顺序抓取
    _excuteSnatchTxt() {
        var _this = this,
            list = _this._list,
            hasChapterNum = _this._chapterNum - list.length, // 已经下载的章节数
            progress = parseInt(hasChapterNum * 100 / _this._chapterNum); // 当前下载进度
        console.log('执行-----' + list.length + '  isOk===' + _this._isOk);

        if(_this._isOk){
            _this._isOk = false;
            var chapter = list.shift();
            _this._snatchTxt(chapter.name, chapter.href);
            _this.snatchCallback && _this.snatchCallback(chapter.name, progress);
            if(list.length > 0){
                _this._excuteSnatchTxt();
            }else{
                _this.snatchCallback && _this.snatchCallback(chapter.name, 100);
                setTimeout(function() {
                    console.log(_this._book + ' 下载完毕！');
                    fs.appendFileSync(_this._outputDir + _this._book + '.txt', _this._errorLog);
                    _this.callback && _this.callback();
                }, 2000);
            }
        }else{
            // 使用setTimeout是为了让它出让cpu，不能让它一直占用着，
            // 不然其他代码段没办法执行
            setTimeout(function(){
                _this._excuteSnatchTxt();
            }, 300);
        }
    },
    // 抓取具体小说内容
    _snatchTxt: function(chapterName, bookUrl) {
        var _this = this;
        var url = _this._option.base + bookUrl;
        var req = http.request(url, function(res) {
            //解决中文编码问题
            var bufferHelper = new BufferHelper();
            res.on('data', function(chunk) {
                bufferHelper.concat(chunk);
            });
            res.on('end', function() {
                //注意，此编码必须与抓取页面的编码一致，否则会出现乱码，也可以动态去识别
                var val = iconv.decode(bufferHelper.toBuffer(), 'gbk');
                var $ = cheerio.load(val);
                var text = $('#txtContent').text();
                if(text.length > 200){
                    text = chapterName + '\r\n' + text;
                    _this._appendTxt(chapterName, text);
                }else{
                    text = chapterName + '\r\n' + text;
                    _this._errorLog += text;
                }
                // 重置标志
                _this._isOk = true;
            });
        }).on('error', function(e) {
            console.log(e.message);
        });
        req.end();
    },
    // 将章节写入文件
    _appendTxt: function(chapterName, txt) {
        fs.appendFileSync(this._outputDir + this._book + '.txt', txt);
    	console.log(chapterName + '   下载完毕……');
    },
    // 格式化时间
    _dateFormat: function() {
        Date.prototype.Format = function (fmt) { //author: meizz
            var o = {
                "M+": this.getMonth() + 1, //月份
                "d+": this.getDate(), //日
                "h+": this.getHours(), //小时
                "m+": this.getMinutes(), //分
                "s+": this.getSeconds(), //秒
                "q+": Math.floor((this.getMonth() + 3) / 3), //季度
                "S": this.getMilliseconds() //毫秒
            };
            if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
            for (var k in o)
            if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
            return fmt;
        }
    }
};

exports.catchnovel = Program;

/*
 * @project: TERA
 * @version: Development (beta)
 * @copyright: Yuriy Ivanov 2017-2018 [progr76@gmail.com]
 * @license: Not for evil
 * GitHub: https://github.com/terafoundation/wallet
 * Twitter: https://twitter.com/terafoundation
 * Telegram: https://web.telegram.org/#/im?p=@terafoundation
*/

"use strict";
const fs = require('fs');
module.exports = class 
{
    constructor()
    {
        this.DBMap = {}
    }
    CheckPathDB()
    {
        var Path = GetDataPath("DB");
        CheckCreateDir(Path)
    }
    CloseDBFile(name, bdelete)
    {
        this.LastHash = undefined
        this.WasUpdate = 1
        var Item = this.DBMap[name];
        if(Item)
        {
            let bDelete = bdelete;
            let Name = name;
            fs.close(Item.fd, function (err)
            {
                if(!err)
                {
                    if(bDelete)
                    {
                        var fname = GetDataPath("DB/" + Name);
                        fs.unlink(fname, function (err)
                        {
                            if(err)
                                ToLog(err)
                        })
                    }
                }
                else
                {
                    ToLog(err)
                }
            })
            delete this.DBMap[name]
        }
    }
    OpenDBFile(name, bExist)
    {
        this.LastHash = undefined
        this.WasUpdate = 1
        var Item = this.DBMap[name];
        if(Item === undefined)
        {
            if(!this.WasCheckPathDB)
            {
                this.CheckPathDB()
                this.WasCheckPathDB = true
            }
            var fname = GetDataPath("DB/" + name);
            if(!fs.existsSync(fname))
            {
                if(bExist)
                {
                    this.DBMap[name] = null
                    return null;
                }
                var fd = fs.openSync(fname, "w+");
                fs.closeSync(fd)
            }
            var fd = fs.openSync(fname, "r+");
            var stat = fs.statSync(fname);
            var size = stat.size;
            Item = {name:name, fname:fname, fd:fd, size:size, FillRows:0, CountRows:0, }
            this.DBMap[name] = Item
        }
        return Item;
    }
};

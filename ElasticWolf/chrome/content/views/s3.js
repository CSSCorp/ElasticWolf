//
//  Author: Vlad Seryakov vseryakov@gmail.com
//  May 2012
//


var ew_S3BucketsTreeView = {
    model : "s3Buckets",
    path: [],
    folder: '',

    keyName: function(name)
    {
        return name.replace(/[ \/\\'":]+/g, '');
    },

    isFolder: function(item)
    {
        return !this.path.length || item.label[item.label.length - 1] == "/";
    },

    displayDetails: function(event)
    {
        var item = this.getSelected()
        if (item == null) return
        // Folder or bucket
        if (this.isFolder(item)) {
            this.path.push(item.folder);
            this.show();
            return;
        }
        // Try to show this file in popup
        this.showFile();
    },


    displayInfo : function()
    {
        var item = this.getSelected()
        if (item == null) return
        if (!this.path.length) {
            this.core.api.getS3BucketLocation(item.name);
        }
        TreeView.displayDetails.call(this);
    },

    display : function(list)
    {
        var idx = -1;
        var path = this.path.join("/") + "/";
        var nlist = [];
        var labels = {};
        for (var i in list) {
            if (!this.path.length) {
                list[i].folder = list[i].label = list[i].name;
                nlist.push(list[i]);
            } else {
                var n = this.path[0] + "/" + list[i].name;
                var p = n.split("/");
                if (n <= path || n.indexOf(path) != 0) continue;
                list[i].folder = list[i].label = p.slice(this.path.length, this.path.length + 1).join("/");
                if (p.length > this.path.length + 1) list[i].label += "/";
                // Skip subfolders
                if (labels[list[i].label]) continue;
                labels[list[i].label] = 1;
                nlist.push(list[i]);
            }
            // Select given item
            if (list[i].label == this.folder) {
                idx = nlist.length - 1;
            }
        }
        TreeView.display.call(this, nlist);
        if (idx >= 0) this.setSelected(idx);
        $("ew.s3Buckets.path").value = path;
        this.folder = '';
    },

    selectionChanged: function()
    {
    },

    menuChanged: function()
    {
        var item = this.getSelected()
        $("ew.s3Buckets.back").disabled = !this.path.length;
        $("ew.s3Buckets.edit").disabled = !this.path.length || !item || !item.bucket || item.size > 1024*1024;
        $("ew.s3Buckets.createFile").disabled = !this.path.length;
        $("ew.s3Buckets.download").disabled = !item || this.isFolder(item);
    },

    show: function()
    {
        var me = this;
        if (!this.path.length) {
            this.display(this.core.queryModel('s3Buckets'));
        } else {
            var item = this.core.getS3Bucket(this.path[0])
            if (item.keys && item.keys.length) {
                this.display(item.keys);
            } else {
                this.core.api.listS3BucketKeys(item.name, null, function(obj) {
                    if (item.name == obj.name) {
                        me.display(obj.keys);
                    }
                })
            }
        }
    },

    refresh: function()
    {
        if (!this.path.length) {
            TreeView.refresh.call(this);
        } else {
            var item = this.core.getS3Bucket(this.path[0]);
            item.keys = null;
            this.show();
        }
    },

    back: function(event)
    {
        this.folder = this.path.pop();
        this.show();
    },

    setStatus: function(file, p)
    {
        file = DirIO.fileName(file);
        document.getElementById("ew.s3Buckets.status").value = file + ": " + (p >= 0 && p <= 100 ? Math.round(p) : 100) + "%";
    },

    create: function() {
        var me = this;
        var inputs = [ {label: this.path.length ? "Folder Name" : "Bucket Name",required:1},
                       {label:"ACL",type:"menulist",list:[{name:"Private",id:"private"},
                                                          {name:"Public Read",id:"public-read"},
                                                          {name:"Public Read Write",id:"public-read-write"},
                                                          {name:"Authenticated Read",id:"authenticated-read"},
                                                          {name:"Bucket Owner Read",id:"bucket-owner-read"},
                                                          {name:"Bucket Owner Full Control",id:"bucket-owner-full-control"}],required:1}, ]
        if (!this.path.length) {
            inputs.push({label:"Region",type:"menulist",list:this.core.getS3Regions(),key:'region'});
        }

        var values = this.core.promptInput("Create S3 " + this.path.length ? "Folder" : "Bucket", inputs);
        if (!values) return;
        var params = {};
        if (values[1]) params["x-amz-acl"] = values[1];
        if (!this.path.length) {
            this.core.api.createS3Bucket(values[0], values[2], params, function() { me.refresh(true); });
        } else {
            this.core.getS3Bucket(this.path[0]).keys = []
            this.core.api.createS3BucketKey(this.path[0], this.path.slice(1).join('/') + '/' + values[0] + '/', params, null, function() { me.show(); });
        }
    },

    remove: function() {
        var me = this;
        var item = this.getSelected();
        if (item == null) return;
        if (!confirm("Delete " + item.name + "?")) return;

        if (!item.bucket) {
            this.core.api.deleteS3Bucket(item.name, {}, function() { me.refresh(true); });
        } else {
            this.core.getS3Bucket(item.bucket).keys = [];
            this.core.api.deleteS3BucketKey(item.bucket, item.name, {}, function() { me.show(); });
        }
    },

    download: function() {
        var me = this;
        var item = this.getSelected()
        if (this.isFolder(item)) return

        var file = this.core.promptForFile("Save to file", true, DirIO.fileName(item.name))
        if (file) {
            this.core.api.getS3BucketKey(item.bucket, item.name, "", {}, file,
                    function(f) { me.setStatus(f, 100); },
                    function(f, p) { me.setStatus(f, p); } )
        }
    },

    upload: function() {
        if (!this.path.length) return;
        var me = this;
        var file = this.core.promptForFile("Upload file")
        if (file) {
            var item = this.core.getS3Bucket(this.path[0])
            item.keys = []
            var f = FileIO.open(file)
            var name = this.keyName(f.leafName)
            this.core.api.uploadS3BucketFile(item.name, this.path.slice(1).join('/') + '/' + name, "", {}, file,
                    function(fn) { me.show(); },
                    function(fn, p) { me.setStatus(fn, p); });
        }
    },

    showFile: function()
    {
        var me = this;
        var item = this.getSelected()
        if (item == null) return
        if (this.isFolder(item)) return
        var type = this.core.getMimeType(item.name);
        if (type.indexOf("image") > -1) {
            var file = DirIO.get("TmpD").path + "/" + DirIO.fileName(item.name);
            this.core.api.getS3BucketKey(item.bucket, item.name, "", {}, file,
                function(f) {
                     me.setStatus(f, 100);
                     try { if (me.win) me.win.close(); } catch(e) { debug(e) }
                     me.win = me.core.promptInput(item.bucket + "/" + item.name, [ {type:"image",value:"file://" + file,width:"100%",height:"100%",nobox:1,scale:1} ], true);
                },
                function(f, p) { me.setStatus(f, p); } )
        }

        if (type.indexOf("text") > -1) {
            this.edit();
        }
    },

    edit: function() {
        var me = this;
        var item = this.getSelected()
        if (this.isFolder(item)) return
        if (item.size > 1024*1024) {
            alert(item.name + " is too big");
            return;
        }
        // Read current ACLs
        if (!this.path.length) {
            this.core.api.getS3BucketAcl(item.name);
        } else {
            this.core.api.getS3BucketKeyAcl(item.bucket, item.name);
        }

        this.core.api.readS3BucketKey(item.bucket, item.name, "", {}, function(t) {
            var values = me.core.promptInput('Edit ' + item.name, [{multiline:true,rows:25,cols:60,value:t,flex:1,scale:1}]);
            if (!values) return;
            me.core.api.putS3BucketKey(item.bucket, item.name, "", {}, values[0], function() {
                item.size = values[0].length;
                me.show();
                debug(item.acls);
                // Apply same ACLs
                me.core.api.updateS3Acl(item);
            });
        });
    },

    createFile: function() {
        var me = this;
        if (!this.path.length) return;
        var item = this.core.getS3Bucket(this.path[0])
        item.keys = []
        var values = me.core.promptInput('Create file', [{label:"File Name",type:"name",required:1},
                                                         {label:"Text",multiline:true,rows:25,cols:60,flex:1,scale:1,required:1},
                                                         {label:"Permisions",type:"radio",list:["Private","Public Read","Public Read-Write","Authenticated Read","Owner Read","Owner Full Control"]},
                                                         ]);
        if (!values) return;
        var name = this.path.slice(1).join('/') + '/' + this.keyName(values[0])
        var params = {}
        switch (values[2]) {
        case "Private":
            params["x-amz-acl"] = "private";
            break;
        case "Public Read":
            params["x-amz-acl"] = "public-read";
            break;
        case "Public Read-Write":
            params["x-amz-acl"] = "public-read-write";
            break;
        case "Authenticated Read":
            params["x-amz-acl"] = "authenticated-read";
            break;
        case "Owner Read":
            params["x-amz-acl"] = "bucket-owner-read";
            break;
        case "Owner Full Control":
            params["x-amz-acl"] = "bucket-owner-full-control";
            break;
        }
        me.core.api.putS3BucketKey(item.name, name, "", params, values[1], function() {
            me.show();
        });
    },

    manageAcls: function() {
        var me = this;
        var item = this.getSelected()
        if (item == null) return
        var retVal = { ok : null, content: null };

        function wrap() {
            window.openDialog("chrome://ew/content/dialogs/manage_s3acl.xul", null, "chrome,centerscreen,modal,resizable", me.core, retVal, item);
            if (retVal.ok) {
                if (item.bucket) {
                    me.core.api.setS3BucketKeyAcl(item.bucket, item.name, retVal.content, function() { me.selectionChanged(); })
                } else {
                    me.core.api.setS3BucketAcl(item.name, retVal.content, function() { me.selectionChanged(); })
                }
            }
        }

        if (!this.path.length) {
            this.core.api.getS3BucketAcl(item.name, wrap)
        } else {
            this.core.api.getS3BucketKeyAcl(item.bucket, item.name, wrap)
        }
    },

    manageWebsite: function() {
        if (this.path.length) return;
        var me = this;
        var item = this.getSelected()
        if (item == null) return
        this.core.api.getS3BucketWebsite(item.name, function(obj) {
            var values = me.core.promptInput('Website', [ {label:"Website Enabled",type:"checkbox",value:obj.indexSuffix && obj.indexSuffix != '' ? true  :false},
                                                          {label:"Index Document Suffix",value:obj.indexSuffix || ""},
                                                          {label:"Error Document Key",value:obj.errorKey || ""}]);
            if (!values) return;
            if (values[0]) {
                me.core.api.setS3BucketWebsite(item.name, values[1], values[2], function() { me.selectionChanged(); })
            } else {
                me.core.api.deleteS3BucketWebsite(item.name, function() { me.selectionChanged(); })
            }
        });
    },

};


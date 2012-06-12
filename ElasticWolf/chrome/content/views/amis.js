var ew_AMIsTreeView = {
    model : ['images','securityGroups','instances', 'keypairs', 'vpcs', 'subnets', 'availabilityZones' ],
    favorites: "ew.images.favorites",
    properties: ['ownerAlias', 'isPublic', 'state'],

    menuChanged : function(event)
    {
        var image = this.getSelected();
        var fDisabled = (image == null);

        if (fDisabled) {
            $("ew.images.contextmenu").hidePopup();
            return;
        }

        fDisabled = !isWindows(image.platform);

        // If this is not a Windows Instance, Disable the following context menu items.
        $("amis.context.migrate").disabled = fDisabled;

        // These items apply only to AMIs
        fDisabled = !(image.id.match(regExs["ami"]));
        $("amis.context.register").disabled = fDisabled;
        $("amis.context.deregister").disabled = fDisabled;
        $("amis.context.launch").disabled = fDisabled;
        $("amis.context.delete").disabled = fDisabled;
        $("amis.context.perms").disabled = image.state == "deregistered";

        // These context menu items don't apply to Windows instancesso enable them.

        // These items don't apply to AMIs with root device type 'ebs'
        if (isEbsRootDeviceType(image.rootDeviceType)) {
            $("amis.context.delete").disabled = true;
            $("amis.context.deleteSnapshotAndDeregister").disabled = false;
        } else {
            $("amis.context.deleteSnapshotAndDeregister").disabled = true;
        }

        var type = $("ew.images.type").value;
        $("amis.context.fadd").disabled = type == "fav";
        $("amis.context.fdelete").disabled = type != "fav";
    },

    imageTypeChanged : function()
    {
        $("ew.images.search").value = "";
        this.invalidate();
    },

    manageFavorites: function(remove) {
        var image = this.getSelected();
        if (image == null) return;
        var favs = ew_session.getStrPrefs(this.favorites, "").split("^");
        debug(remove + ":" + favs)
        if (remove) {
            var i = favs.indexOf(image.id)
            if (i > -1) {
                favs.splice(i, 1)
            }
        } else {
            if (favs.indexOf(image.id) == -1) {
                favs.push(image.id)
            }
        }
        ew_session.setStrPrefs(this.favorites, favs.join("^"));
        if (remove) {
            this.invalidate();
        }
    },

    filter: function(list)
    {
        if (!list) return list;
        var type = $("ew.images.type");
        if (type.value == "fav") {
            var favs = ew_session.getStrPrefs(this.favorites, "").split("^");
            var images = [];
            for (var i in list) {
                if (favs.indexOf(list[i].id) >= 0) {
                    images.push(list[i])
                }
            }
            return TreeView.filter.call(this, images);
        }

        // Initialize the owner display filter to the empty string
        var alias = null, owner = null, root = null, rx = null;
        if (type.value == "my_ami" || type.value == "my_ami_rdt_ebs") {
            var groups = ew_model.get('securityGroups');
            if (groups && groups.length) {
                owner = groups[0].ownerId;
                rx = regExs["ami"];
                root = type.value == "my_ami" ? null : "ebs";
            }
        } else
        if (type.value == "amzn" || type.value == "amzn_rdt_ebs") {
            alias = "amazon";
            root = type.value == "amzn" ? null : "ebs";
        } else
        if (type.value == "rdt_ebs") {
            root = "ebs";
        } else
        if (type.value == "rdt_is") {
            root = "instance-store";
        } else {
            rx = regExs[type.value || "all"];
        }
        var nlist = new Array();
        for (var i in list) {
            if (rx && !list[i].id.match(rx)) continue;
            if (root && root != list[i].rootDeviceType) continue;
            if (alias && alias != list[i].ownerAlias) continue;
            if (owner && owner != list[i].owner) continue;
            nlist.push(list[i])
        }
        return TreeView.filter.call(this, nlist);
    },

    launchNewInstances : function()
    {
        var image = this.getSelected();
        if (image == null) return;
        var retVal = { ok : null, tag: "" };

        window.openDialog("chrome://ew/content/dialogs/create_instances.xul", null, "chrome,centerscreen,modal,resizable", image, ew_session, retVal);
        if (retVal.ok) {
            if (retVal.name) {
                retVal.tag += "Name:" + retVal.name;
            }
            ew_session.controller.runInstances(retVal.imageId, retVal.kernelId, retVal.ramdiskId, retVal.minCount, retVal.maxCount, retVal.keyName,
                                               retVal.securityGroups, retVal.userData, retVal.properties, retVal.instanceType, retVal.placement,
                                               retVal.subnetId, retVal.ipAddress, function(list) {
                if (retVal.tag != "") {
                    var tags = ew_session.parseTags(retVal.tag);
                    ew_session.setTags(list, tags, function() { ew_InstancesTreeView.refresh() });
                } else {
                    ew_InstancesTreeView.refresh();
                }
                ew_session.selectTab('ew.tabs.instance');
            });
        }
    },

    callRegisterImageInRegion : function(manifest, region)
    {
        var me = this;
        var wrap = function(x)
        {
            me.refresh();
            alert("Image with Manifest: " + manifest + " was registered");
        }
        ew_session.controller.registerImageInRegion(manifest, region, wrap);
    },

    registerNewImage : function()
    {
        var me = this;
        var value = prompt('AMI Manifest Path:');
        if (value) {
            var oldextre = new RegExp("\\.manifest$");
            var newextre = new RegExp("\\.manifest\\.xml$");
            if (value.match(oldextre) == null && value.match(newextre) == null) {
                alert("Manifest files should end in .manifest or .manifest.xml");
                return false;
            }
            var s3bucket = value.split('/')[0];
            if (s3bucket.match(new RegExp("[A-Z]"))) {
                alert("The S3 bucket must be all lower case");
                return false;
            }
            var httppre = new RegExp("^http", "i");
            if (value.match(httppre) != null) {
                alert("Just specify the bucket and manifest path name, not the entire S3 URL.");
                return false;
            }
            var s3bucket = value.split('/')[0];
            var bucketReg = ew_session.controller.getS3BucketLocation(s3bucket, function(bucket, region) {
                me.callRegisterImageInRegion(value, region);
            });
        }
    },

    deregisterImage : function(fDelete)
    {
        var image = this.getSelecteed();
        if (!image) return;
        if (fDelete == undefined) {
            fDelete = confirm("Deregister AMI " + image.id + " (" + image.location + ")?");
        }
        if (!fDelete) return;
        var me = this;
        ew_session.controller.deregisterImage(image.id, function() {me.refresh()});
    },

    migrateImage : function()
    {
        var image = this.getSelected();
        if (image == null) return;
        if (this.currentlyMigrating && this.amiBeingMigrated == image.id) {
            alert("This AMI is currently being migrated!");
            return;
        }

        var retVal = { ok : null };
        window.openDialog("chrome://ew/content/dialogs/migrate_ami.xul", null, "chrome,centerscreen,modal,resizable", image, ew_session, retVal);
        if (retVal.ok) {
            this.currentlyMigrating = true;
            this.amiBeingMigrated = image.id;
            retVal.ok = false;
            // TODO: Finish up AMI migration with visual prompts
            //window.openDialog("chrome://ew/content/dialogs/copy_S3_keys.xul", null, "chrome, dialog, centerscreen, resizable=yes", ew_session, retVal);
        }
    },

    finishMigration : function(retVal)
    {
        if (retVal.ok) {
            // Register the new AMI
            var manifest = retVal.destB + "/" + retVal.prefix + ".manifest.xml";
            log("Registering AMI with manifest: " + manifest);
            this.callRegisterImageInRegion(manifest, retVal.region);
        }
        this.currentlyMigrating = false;
        this.amiBeingMigrated = null;
    },

    deleteImage : function()
    {
        var image = this.getSelected();
        if (image == null) return;

        if (this.currentlyMigrating && this.amiBeingMigrated == image.id) {
            alert("This AMI is currently being migrated. Please try *Deleting* it after the Migration.");
            return;
        }

        if (confirm("Are you sure you want to delete this AMI and all its parts from S3? The AMI will be deregistered as well.")) {
            var retVal = { ok : null };
            window.openDialog("chrome://ew/content/dialogs/delete_ami.xul", null, "chrome,centerscreen,modal,resizable", ew_session, image.location, retVal);
            if (retVal.ok) {
                // Keys have been deleted. Let's deregister this image
                this.deregisterImage(true);
            }
        }
    },

    deleteSnapshotAndDeregister : function()
    {
        var image = this.getSelected();
        if (image == null) return;

        var ami = image.id;
        var snapshot = image.snapshotId;
        if (confirm("Are you sure you want to delete this AMI (" + ami + ") " + "and the accompanying snapshot (" + snapshot + ")?")) {
            var me = this;
            var wrap = function()
            {
                ew_session.controller.deleteSnapshot(snapshot, function() { ew_SnapshotTreeView.refresh() });
                me.refresh();
            }
            ew_session.controller.deregisterImage(ami, wrap);
        }
    },

    viewPermissions: function()
    {
        var image = this.getSelected();
        if (image == null) return;
        ew_session.controller.describeLaunchPermissions(this.image.id, function(list) {
            window.openDialog("chrome://ew/content/dialogs/manage_ami_permissions.xul", null, "chrome,centerscreen,modal,resizable", ew_session, image, list);
        });
    },
};

ew_AMIsTreeView.__proto__ = TreeView;
ew_AMIsTreeView.register();

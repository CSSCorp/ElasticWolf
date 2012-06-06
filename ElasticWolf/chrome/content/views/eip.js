var ew_ElasticIPTreeView = {
    COLNAMES : ['eip.publicIp','eip.instanceId','eip.allocationId','eip.associationId','eip.domain','eip.tags'],
    model: [ "addresses", "instances", "networkInterfaces" ],
    tagId: "publicIp",

    enableOrDisableItems : function() {
        var eip = this.getSelected();
        document.getElementById("ew.addresses.contextmenu").disabled = (eip == null);
        if (eip == null) return;

        var fAssociated = true;
        if (eip.instanceId == null || eip.instanceId == "") {
            // There is no instance associated with this address
            fAssociated = false;
        }
        document.getElementById("addresses.context.disassociate").disabled = !fAssociated;
    },

    allocateAddress : function() {
        var vpc = true
        if (!ew_session.client.isGovCloud()) {
            vpc = ew_session.promptYesNo("Confirm", "Is this Elastic IP to be used for VPC?");
        }
        var me = this;
        ew_session.controller.allocateAddress(vpc, function() { me.refresh() });
    },

    releaseAddress : function() {
        var eip = this.getSelected();
        if (eip == null) return;
        if (!ew_session.promptYesNo("Confirm", "Release "+eip.publicIp+"?")) return;

        var me = this;
        ew_session.controller.releaseAddress(eip, function() { me.refresh() });
    },

    getUnassociatedInstances : function() {
        var instances = ew_model.getInstances('state', 'running');
        var unassociated = new Array();
        var eips = {};

        // Build the list of EIPs that are associated with an instance
        for (var i in this.treeList) {
            var eip = this.treeList[i];
            if (eip.instanceId == null || eip.instanceId.length == 0) {
                continue;
            }
            eips[eip.instanceId] = eip.publicIp;
        }

        for (var i in instances) {
            if (eips[instances[i].id]) {
                continue;
            }
            unassociated.push(instances[i]);
        }
        return unassociated;
    },

    associateAddress : function(eip) {
        // If an elastic IP hasn't been passed in to be persisted to EC2, create a mapping between the Address and Instance.
        if (eip == null) {
            eip = this.getSelected();
            if (eip == null) return;

            if (eip.instanceId != null && eip.instanceId != '') {
                var confirmed = confirm("Address "+eip.publicIp+" is already mapped to an instance, are you sure?");
                if (!confirmed)
                    return;
            }

            var list = this.getUnassociatedInstances();
            list = list.concat(ew_model.getNetworkInterfaces())

            var idx = ew_session.promptList("Associate Elastic IP", "Which Instance/ENI would you like to associate "+ eip.publicIp +" with?", list, ['__class__', 'toString'], 550);
            if (idx < 0) return;
            // Determine what type we selected
            if (list[idx].imageId) {
                eip.instanceId = list[idx].id;
            } else {
                eip.eniId = list[idx].id;
            }
        }

        var me = this;
        ew_session.controller.associateAddress(eip, eip.instanceId, eip.eniId, function() { me.refresh() });
        return true;
    },

    disassociateAddress : function() {
        var eip = this.getSelected();
        if (eip == null) return;
        if (eip.instanceId == null || eip.instanceId == '') {
            alert("This EIP is not associated")
            return;
        }
        if (!confirm("Disassociate "+eip.publicIp+" and instance "+eip.instanceId+"?")) return;
        var me = this;
        ew_session.controller.disassociateAddress(eip, function() { me.refresh() });
    },

    copyPublicDnsToClipBoard : function(fieldName) {
        var eip = this.getSelected();
        if (!eip || !eip.instanceId) { return; }

        var instance = ew_model.getInstanceById(eip.instanceId);
        if (instance) {
            copyToClipboard(instance.publicDnsName);
        }
    }

};

ew_ElasticIPTreeView.__proto__ = TreeView;
ew_ElasticIPTreeView.register();

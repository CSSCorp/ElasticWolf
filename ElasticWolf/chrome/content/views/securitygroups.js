var ew_SecurityGroupsTreeView = {
    COLNAMES : ['securityGroup.id', 'securitygroup.ownerId','securitygroup.name','securitygroup.vpcId','securitygroup.description'],
    model: [ "securityGroups", "vpcs" ],

    selectionChanged : function() {
        var group = this.getSelected();
        if (!group) return;
        ew_PermissionsTreeView.display(group.permissions);
    },

    createNewGroup : function () {
        var retVal = {ok:null,name:null,description:null,vpcId:null};
        window.openDialog("chrome://ew/content/dialogs/create_security_group.xul", null, "chrome,centerscreen,modal,resizable", ew_session, retVal);
        if (retVal.ok) {
            var me = this;
            var wrap = function(id) {
                retVal.id = id
                me.refresh();
                me.authorizeCommonProtocolsByUserRequest(retVal);
            }
            ew_session.controller.createSecurityGroup(retVal.name, retVal.description, retVal.vpcId, wrap);
        }
    },

    authorizeCommonProtocolsByUserRequest : function(retVal) {
        var result = {ipAddress:"0.0.0.0"};
        var cidr = null;
        // Determine the CIDR for the protocol authorization request
        switch (retVal.enableProtocolsFor) {
        case "host":
            ew_session.client.queryCheckIP("", result);
            cidr = result.ipAddress.trim() + "/32";
            break;
        case "network":
            ew_session.client.queryCheckIP("block", result);
            cidr = result.ipAddress.trim();
            break;
        default:
            cidr = null;
            break;
        }

        // Need to authorize SSH and RDP for either this host or the network.
        if (cidr != null) {
            var wrap = function() {
                ew_SecurityGroupsTreeView.refresh();
            }

            // 1st enable SSH
            ew_session.controller.authorizeSourceCIDR('Ingress', retVal, "tcp", protPortMap["ssh"], protPortMap["ssh"], cidr, null);

            // enable RDP and refresh the view
            ew_session.controller.authorizeSourceCIDR('Ingress', retVal, "tcp", protPortMap["rdp"], protPortMap["rdp"], cidr, wrap);
        } else {
            // User wants to customize the firewall...
            ew_PermissionsTreeView.grantPermission();
        }
    },

    deleteSelected  : function () {
        var group = this.getSelected();
        if (group == null) return;

        var confirmed = confirm("Delete group "+group.name+"?");
        if (!confirmed)
            return;

        var me = this;
        var wrap = function() {
            me.refresh();
        }
        ew_session.controller.deleteSecurityGroup(group, wrap);
    },

};

ew_SecurityGroupsTreeView.__proto__ = TreeView;
ew_SecurityGroupsTreeView.register();

var ew_PermissionsTreeView = {
    COLNAMES : ['permission.type','permission.protocol','permission.fromPort','permission.toPort','permission.cidrIp','permission.srcGroup'],

    grantPermission : function(type) {
        var group = ew_SecurityGroupsTreeView.getSelected();
        if (group == null) return;

        retVal = {ok:null, type: 'Ingress'};
        window.openDialog("chrome://ew/content/dialogs/create_permission.xul", null, "chrome,centerscreen,modal,resizable", group, ew_session, retVal);

        if (retVal.ok) {
            var me = this;
            var wrap = function() {
                ew_SecurityGroupsTreeView.refresh();
            }

            var newPerm = retVal.newPerm;
            if (newPerm.cidrIp != null) {
                ew_session.controller.authorizeSourceCIDR(retVal.type, group, newPerm.ipProtocol, newPerm.fromPort, newPerm.toPort, newPerm.cidrIp, wrap);
            } else {
                ew_session.controller.authorizeSourceGroup(retVal.type, group, newPerm.ipProtocol, newPerm.fromPort, newPerm.toPort, newPerm.srcGroup, wrap);
            }
        }
    },

    revokePermission : function() {
        var group = ew_SecurityGroupsTreeView.getSelected();
        if (group == null) return;
        var perms = new Array();
        for(var i in this.treeList) {
            if (this.selection.isSelected(i)) {
                perms.push(this.treeList[i]);
            }
        }
        if (perms.length == 0) return;
        if (!confirm("Revoke selected permission(s) on group "+group.name+"?")) return;

        var me = this;
        var wrap = function() {
            ew_SecurityGroupsTreeView.refresh();
        }

        var permission = null;
        for (i in perms) {
            permission = perms[i];
            if (permission.cidrIp) {
                ew_session.controller.revokeSourceCIDR(permission.type,group,permission.protocol,permission.fromPort,permission.toPort,permission.cidrIp,wrap);
            } else {
                ew_session.controller.revokeSourceGroup(permission.type,group,permission.protocol,permission.fromPort,permission.toPort,permission.srcGroup,wrap);
            }
        }

    },

};

ew_PermissionsTreeView.__proto__ = TreeView;

package com.somaj.members

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FamilyRestroom
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.viewmodel.compose.viewModel
import com.somaj.auth.UserProfile

private val EmeraldPrimary = Color(0xFF0D532B)
private val EmeraldSecondary = Color(0xFF1B5E20)
private val EmeraldLight = Color(0xFFE8F5E9)
private val GoldAccent = Color(0xFFD4AF37)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemberListScreen(
    user: UserProfile? = null,
    viewModel: MemberViewModel = viewModel(),
    onBackClick: () -> Unit
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()
    val serverAdminFlag by viewModel.isUserAdmin.collectAsState()
    val isAdmin = serverAdminFlag || user?.role.equals("ADMIN", ignoreCase = true)
    val permissions by viewModel.permissions.collectAsState()

    var searchQuery by remember { mutableStateOf("") }
    var selectedPara by remember { mutableStateOf("সব পাড়া") }

    var memberToDelete by remember { mutableStateOf<MemberItem?>(null) }
    var memberToEdit by remember { mutableStateOf<MemberItem?>(null) }
    var selectedFamilyProfile by remember { mutableStateOf<MemberItem?>(null) }
    var showAddMemberDialog by remember { mutableStateOf(false) }

    var isSearchExpanded by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current

    LaunchedEffect(Unit) {
        viewModel.fetchMembers(context)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("সমাজ সদস্য তালিকা", fontSize = 18.sp, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "পিছনে যান")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.fetchMembers(context) }) {
                        Icon(Icons.Default.Refresh, contentDescription = "রিফ্রেশ")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = EmeraldPrimary,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White,
                    actionIconContentColor = Color.White
                )
            )
        },
        floatingActionButton = {
            if (isAdmin || permissions.canCreate == 1) {
                FloatingActionButton(
                    onClick = { showAddMemberDialog = true },
                    containerColor = EmeraldPrimary,
                    contentColor = Color.White,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(imageVector = Icons.Filled.Add, contentDescription = "নতুন সদস্য যোগ করুন")
                }
            }
        },
        containerColor = Color(0xFFF7FAF8),
        modifier = Modifier.imePadding()
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when (val state = uiState) {
                is MemberUiState.Loading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = EmeraldPrimary)
                    }
                }

                is MemberUiState.Error -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(text = state.message, color = Color.Red, fontSize = 14.sp)
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = { viewModel.fetchMembers(context) },
                            colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary)
                        ) {
                            Text("পুনরায় চেষ্টা করুন")
                        }
                    }
                }

                is MemberUiState.Success -> {
                    val allMembers = remember(state.members) {
                        state.members.distinctBy { it.id }
                    }

                    val paraList = remember(allMembers) {
                        listOf("সব পাড়া") + allMembers.mapNotNull { it.paraName }.distinct()
                    }

                    val filteredMembers = remember(searchQuery, selectedPara, allMembers) {
                        allMembers.filter { member ->
                            val memberName = member.name ?: ""
                            val memberPhone = member.phone ?: ""
                            val matchesSearch = memberName.contains(searchQuery, ignoreCase = true) ||
                                    memberPhone.contains(searchQuery)
                            val matchesPara = if (selectedPara == "সব পাড়া") true else member.paraName == selectedPara
                            matchesSearch && matchesPara
                        }
                    }

                    val totalFamilies = filteredMembers.size
                    val totalIndividuals = filteredMembers.sumOf { member ->
                        if (member.actualFamilyMembers.isNotEmpty()) {
                            member.actualFamilyMembers.size + 1
                        } else {
                            member.familyMembersCount ?: 1
                        }
                    }

                    Column(modifier = Modifier.fillMaxSize()) {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(containerColor = EmeraldPrimary),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceAround,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(Icons.Default.FamilyRestroom, contentDescription = null, tint = GoldAccent, modifier = Modifier.size(24.dp))
                                    Column(horizontalAlignment = Alignment.Start) {
                                        Text(text = "মোট পরিবার", color = Color(0xCCFFFFFF), fontSize = 10.sp)
                                        Text(text = "$totalFamilies টি", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                                    }
                                }

                                Box(
                                    modifier = Modifier
                                        .height(28.dp)
                                        .width(1.dp)
                                        .background(Color(0x40FFFFFF))
                                )

                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(Icons.Default.Group, contentDescription = null, tint = GoldAccent, modifier = Modifier.size(24.dp))
                                    Column(horizontalAlignment = Alignment.Start) {
                                        Text(text = "সর্বমোট সদস্য", color = Color(0xCCFFFFFF), fontSize = 10.sp)
                                        Text(text = "$totalIndividuals জন", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }

                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 2.dp)
                        ) {
                            if (isSearchExpanded) {
                                OutlinedTextField(
                                    value = searchQuery,
                                    onValueChange = { searchQuery = it },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(bottom = 8.dp)
                                        .focusRequester(focusRequester),
                                    placeholder = { Text("নাম বা মোবাইল নম্বর দিয়ে খুঁজুন...", fontSize = 13.sp) },
                                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = EmeraldPrimary) },
                                    trailingIcon = {
                                        IconButton(onClick = {
                                            isSearchExpanded = false
                                            searchQuery = ""
                                            keyboardController?.hide()
                                        }) {
                                            Icon(Icons.Default.Close, contentDescription = "বন্ধ করুন", tint = Color.Gray)
                                        }
                                    },
                                    shape = RoundedCornerShape(12.dp),
                                    singleLine = true,
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = EmeraldPrimary,
                                        unfocusedBorderColor = Color(0xFFC8E6C9),
                                        focusedContainerColor = Color.White,
                                        unfocusedContainerColor = Color.White
                                    )
                                )

                                LaunchedEffect(Unit) {
                                    focusRequester.requestFocus()
                                    keyboardController?.show()
                                }
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                LazyRow(
                                    modifier = Modifier.weight(1f),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    items(paraList) { para ->
                                        FilterChip(
                                            selected = (para == selectedPara),
                                            onClick = { selectedPara = para },
                                            label = { Text(para, fontSize = 12.sp) },
                                            colors = FilterChipDefaults.filterChipColors(
                                                selectedContainerColor = EmeraldPrimary,
                                                selectedLabelColor = Color.White
                                            )
                                        )
                                    }
                                }

                                if (!isSearchExpanded) {
                                    IconButton(
                                        onClick = { isSearchExpanded = true },
                                        modifier = Modifier
                                            .padding(start = 8.dp)
                                            .size(36.dp)
                                            .clip(CircleShape)
                                            .background(EmeraldLight)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Search,
                                            contentDescription = "খুঁজুন",
                                            tint = EmeraldPrimary,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(4.dp))

                        if (filteredMembers.isEmpty()) {
                            Box(modifier = Modifier.fillMaxSize().weight(1f), contentAlignment = Alignment.Center) {
                                Text("কোনো সদস্য পাওয়া যায়নি", color = Color.Gray, fontSize = 14.sp)
                            }
                        } else {
                            LazyColumn(
                                modifier = Modifier.fillMaxSize().weight(1f),
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                itemsIndexed(filteredMembers, key = { index, member -> "${member.id}_$index" }) { _, member ->
                                    MemberCardItem(
                                        member = member,
                                        isAdmin = isAdmin,
                                        onFamilyClick = { selectedFamilyProfile = member },
                                        onCallClick = {
                                            val phone = member.phone
                                            if (!phone.isNullOrBlank()) {
                                                val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                                                context.startActivity(intent)
                                            } else {
                                                Toast.makeText(context, "ফোন নম্বর উপলব্ধ নেই", Toast.LENGTH_SHORT).show()
                                            }
                                        },
                                        onEditClick = { memberToEdit = member },
                                        onDeleteClick = { memberToDelete = member }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddMemberDialog) {
        AddMemberDialog(
            primaryColor = EmeraldPrimary,
            onDismiss = { showAddMemberDialog = false },
            onConfirm = { name, phone, password, fatherName, paraName ->
                viewModel.adminAddMember(
                    context = context,
                    name = name,
                    phone = phone,
                    password = password,
                    fatherName = fatherName.ifBlank { null },
                    paraName = paraName.ifBlank { null },
                    role = "MEMBER"
                ) {
                    showAddMemberDialog = false
                }
            }
        )
    }

    selectedFamilyProfile?.let { famMember ->
        FamilyProfileDialog(
            member = famMember,
            onDismiss = { selectedFamilyProfile = null },
            onCall = {
                val phone = famMember.phone
                if (!phone.isNullOrBlank()) {
                    val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                    context.startActivity(intent)
                }
            }
        )
    }

    memberToEdit?.let { member ->
        EditMemberDialog(
            member = member,
            onDismiss = { memberToEdit = null },
            onConfirm = { name, phone, father, para, role, famMembers ->
                viewModel.updateMember(context, member.id, name, phone, father, para, role, famMembers) {
                    memberToEdit = null
                }
            }
        )
    }

    memberToDelete?.let { member ->
        AlertDialog(
            onDismissRequest = { memberToDelete = null },
            title = {
                Text(
                    text = "সদস্য ট্র্যাশ বক্সে পাঠাবেন?",
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFC62828),
                    fontSize = 16.sp
                )
            },
            text = {
                Text(
                    text = "আপনি কি নিশ্চিত যে \"${member.name ?: "এই সদস্য"}\"-কে ট্র্যাশ বক্সে পাঠাতে চান?",
                    fontSize = 12.5.sp,
                    lineHeight = 17.sp
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.deleteMember(context, member.id) {
                            memberToDelete = null
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC62828))
                ) {
                    Text("হ্যাঁ, পাঠান", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { memberToDelete = null }) {
                    Text("বাতিল", color = Color.Gray)
                }
            }
        )
    }
}

@Composable
fun MemberCardItem(
    member: MemberItem,
    isAdmin: Boolean,
    onFamilyClick: () -> Unit,
    onCallClick: () -> Unit,
    onEditClick: () -> Unit,
    onDeleteClick: () -> Unit
) {
    val displayName = member.name ?: "নাম প্রকাশে অনিচ্ছুক"
    val isMemberAdmin = (member.baseRole ?: "").equals("ADMIN", ignoreCase = true)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onFamilyClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.5.dp),
        border = BorderStroke(1.dp, Color(0xFFE8F5E9))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(EmeraldLight),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = displayName.take(1),
                        color = EmeraldPrimary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        Text(
                            text = displayName,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF1B3820)
                        )
                        
                        // শুধুমাত্র অ্যাডমিন হলে অ্যাডমিন ট্যাগ দেখাবে, অন্য কোনো ট্যাগ নয়
                        if (isMemberAdmin) {
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = Color(0xFFFFF3E0)
                            ) {
                                Text(
                                    text = "এডমিন",
                                    color = Color(0xFFE65100),
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.5.dp)
                                )
                            }
                        }
                    }

                    if (!member.fatherName.isNullOrBlank()) {
                        Text(
                            text = "পিতা: ${member.fatherName}",
                            fontSize = 11.5.sp,
                            color = Color.Gray
                        )
                    }

                    Spacer(modifier = Modifier.height(3.dp))

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "পাড়া: ${member.paraName ?: "অনির্ধারিত"}",
                            fontSize = 11.sp,
                            color = EmeraldPrimary,
                            fontWeight = FontWeight.Medium
                        )

                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = Color(0xFFF1F5F9),
                            modifier = Modifier.clickable { onFamilyClick() }
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Icon(Icons.Default.Group, contentDescription = null, tint = EmeraldPrimary, modifier = Modifier.size(11.dp))
                                Spacer(modifier = Modifier.width(3.dp))
                                Text(
                                    text = "পরিবার: ${member.familyMembersCount ?: 1} জন",
                                    fontSize = 10.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF334155)
                                )
                            }
                        }
                    }
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = onCallClick,
                        modifier = Modifier
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFE8F5E9))
                    ) {
                        Icon(
                            imageVector = Icons.Default.Call,
                            contentDescription = "কল করুন",
                            tint = EmeraldPrimary,
                            modifier = Modifier.size(16.dp)
                        )
                    }

                    if (isAdmin) {
                        IconButton(
                            onClick = onEditClick,
                            modifier = Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(Color(0xFFE3F2FD))
                        ) {
                            Icon(
                                imageVector = Icons.Default.Edit,
                                contentDescription = "তথ্য পরিবর্তন",
                                tint = Color(0xFF1565C0),
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }

                    if (isAdmin && !isMemberAdmin) {
                        IconButton(
                            onClick = onDeleteClick,
                            modifier = Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(Color(0xFFFFEBEE))
                        ) {
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = "মুছুন",
                                tint = Color(0xFFD32F2F),
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }
            }

            val updatedByName = member.updatedByName
            val updatedAt = member.updatedAt
            if (!updatedByName.isNullOrEmpty()) {
                HorizontalDivider(color = Color(0xFFF3F4F6), thickness = 0.5.dp)
                Text(
                    text = "সর্বশেষ সংশোধন: $updatedByName ${if (!updatedAt.isNullOrEmpty()) "- $updatedAt" else ""}",
                    fontSize = 10.sp,
                    color = Color(0xFFD32F2F),
                    fontStyle = FontStyle.Italic
                )
            }
        }
    }
}

@Composable
fun FamilyProfileDialog(
    member: MemberItem,
    onDismiss: () -> Unit,
    onCall: () -> Unit
) {
    val familyList = member.actualFamilyMembers
    val totalCount = member.familyMembersCount ?: (familyList.size + 1)

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(Brush.linearGradient(listOf(EmeraldSecondary, EmeraldPrimary))),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Group, contentDescription = null, tint = GoldAccent, modifier = Modifier.size(20.dp))
                        }
                        Column {
                            Text(
                                text = member.name ?: "পরিবারের প্রোফাইল",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = EmeraldPrimary
                            )
                            Text(
                                text = "ফ্যামিলি কোড: #${member.displayFamilyCode}",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFFB45309)
                            )
                        }
                    }

                    IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "বন্ধ করুন", tint = Color.Gray)
                    }
                }

                HorizontalDivider(color = Color(0xFFE2E8F0))

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAF8)),
                    border = BorderStroke(1.dp, Color(0xFFC8E6C9))
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = member.name ?: "নাম নেই",
                                fontSize = 13.5.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF1B3820)
                            )
                            // কোনো প্রকার কমিটির ট্যাগ এখানে আর থাকবে না
                            Text(
                                text = "পদবী: পরিবার প্রধান",
                                fontSize = 11.sp,
                                color = EmeraldPrimary,
                                fontWeight = FontWeight.Medium
                            )
                            if (!member.phone.isNullOrBlank()) {
                                Text(
                                    text = "মোবাইল: ${member.phone}",
                                    fontSize = 11.sp,
                                    color = Color.DarkGray
                                )
                            }
                            if (!member.paraName.isNullOrBlank()) {
                                Text(
                                    text = "পাড়া: ${member.paraName}",
                                    fontSize = 10.5.sp,
                                    color = Color.Gray
                                )
                            }
                        }

                        if (!member.phone.isNullOrBlank()) {
                            FilledTonalIconButton(
                                onClick = onCall,
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(Icons.Default.Call, contentDescription = "কল", tint = EmeraldPrimary, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }

                Text(
                    text = "পরিবারের অন্যান্য সদস্যবৃন্দ (মোট $totalCount জন):",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.DarkGray
                )

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 240.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    if (familyList.isEmpty()) {
                        item {
                            Text(
                                text = "পরিবারের নির্দিষ্ট সদস্যদের নাম এন্ট্রি করা নেই (মোট সংখ্যা: $totalCount জন)।",
                                fontSize = 11.5.sp,
                                color = Color.Gray,
                                modifier = Modifier.padding(vertical = 12.dp)
                            )
                        }
                    } else {
                        itemsIndexed(familyList) { index, fam ->
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(8.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                                border = BorderStroke(0.8.dp, Color(0xFFE2E8F0))
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 10.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(24.dp)
                                                .clip(CircleShape)
                                                .background(Color(0xFFF1F5F9)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = "${index + 1}",
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color.DarkGray
                                            )
                                        }
                                        Text(
                                            text = fam.actualName.ifBlank { "সদস্য ${index + 1}" },
                                            fontSize = 12.5.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = Color(0xFF1E293B)
                                        )
                                    }

                                    Surface(
                                        shape = RoundedCornerShape(4.dp),
                                        color = Color(0xFFF1F5F9)
                                    ) {
                                        Text(
                                            text = fam.relation ?: "সদস্য",
                                            fontSize = 10.sp,
                                            color = Color(0xFF475569),
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Button(
                    onClick = onDismiss,
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("ঠিক আছে", fontSize = 13.sp, color = Color.White)
                }
            }
        }
    }
}

@Composable
fun EditMemberDialog(
    member: MemberItem,
    onDismiss: () -> Unit,
    onConfirm: (name: String, phone: String?, father: String?, para: String?, role: String, famMembers: List<FamilyMemberPayload>) -> Unit
) {
    var name by remember { mutableStateOf(member.name ?: "") }
    var phone by remember { mutableStateOf(member.phone ?: "") }
    var fatherName by remember { mutableStateOf(member.fatherName ?: "") }
    var paraName by remember { mutableStateOf(member.paraName ?: "") }

    val isTargetAdmin = (member.baseRole ?: "").equals("ADMIN", ignoreCase = true)
    var selectedRole by remember { mutableStateOf(if (isTargetAdmin) "ADMIN" else (member.baseRole ?: "MEMBER").uppercase()) }

    val familyList = remember {
        mutableStateListOf<Pair<String, String>>().apply {
            val dbList = member.actualFamilyMembers
            if (dbList.isNotEmpty()) {
                dbList.forEach { f ->
                    add(Pair(f.actualName, f.relation ?: "সদস্য"))
                }
            } else {
                val count = member.familyMembersCount ?: 0
                for (i in 1..count) {
                    add(Pair("", "সদস্য"))
                }
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            decorFitsSystemWindows = false,
            usePlatformDefaultWidth = false
        ),
        modifier = Modifier
            .fillMaxWidth(0.92f)
            .imePadding(),
        title = {
            Text(text = "সদস্যের তথ্য পরিবর্তন", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = EmeraldPrimary)
        },
        text = {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 380.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                item {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("সদস্যের নাম *") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                item {
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = { Text("মোবাইল নম্বর") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                item {
                    OutlinedTextField(
                        value = fatherName,
                        onValueChange = { fatherName = it },
                        label = { Text("পিতার নাম") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                item {
                    OutlinedTextField(
                        value = paraName,
                        onValueChange = { paraName = it },
                        label = { Text("পাড়া / মহল্লা") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                item {
                    Text(text = "সদস্যের পদবী / ভূমিকা:", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    if (isTargetAdmin) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFFFF3E0),
                            modifier = Modifier.padding(top = 4.dp)
                        ) {
                            Text(
                                text = "এডমিন (এই অ্যাকাউন্টের পদবী অপরিবর্তনশীল)",
                                color = Color(0xFFE65100),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                            )
                        }
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            listOf("MEMBER" to "সাধারণ সদস্য", "COMMITTEE" to "কমিটি").forEach { (roleKey, roleLabel) ->
                                FilterChip(
                                    selected = selectedRole == roleKey,
                                    onClick = { selectedRole = roleKey },
                                    label = { Text(roleLabel, fontSize = 12.sp) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = EmeraldPrimary,
                                        selectedLabelColor = Color.White
                                    )
                                )
                            }
                        }
                    }
                }

                item {
                    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(text = "পরিবারের অন্যান্য সদস্য (${familyList.size} জন):", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        IconButton(
                            onClick = { familyList.add(Pair("", "সদস্য")) },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(Icons.Default.Add, contentDescription = "যোগ করুন", tint = EmeraldPrimary)
                        }
                    }
                }

                itemsIndexed(familyList) { index, itemPair ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = itemPair.first,
                            onValueChange = { newName ->
                                familyList[index] = Pair(newName, itemPair.second)
                            },
                            placeholder = { Text("সদস্যের নাম", fontSize = 11.sp) },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )

                        OutlinedTextField(
                            value = itemPair.second,
                            onValueChange = { newRelation ->
                                familyList[index] = Pair(itemPair.first, newRelation)
                            },
                            placeholder = { Text("সম্পর্ক", fontSize = 11.sp) },
                            singleLine = true,
                            modifier = Modifier.width(90.dp)
                        )

                        IconButton(
                            onClick = { familyList.removeAt(index) },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(Icons.Default.Close, contentDescription = "বাদ দিন", tint = Color.Red, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (name.isNotBlank()) {
                        val payloadList = familyList
                            .filter { it.first.isNotBlank() }
                            .map { FamilyMemberPayload(memberName = it.first.trim(), relation = it.second.trim()) }

                        onConfirm(
                            name.trim(),
                            phone.trim().ifBlank { null },
                            fatherName.trim().ifBlank { null },
                            paraName.trim().ifBlank { null },
                            if (isTargetAdmin) "ADMIN" else selectedRole,
                            payloadList
                        )
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary)
            ) {
                Text("সংরক্ষণ করুন", color = Color.White)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("বাতিল", color = Color.Gray) }
        }
    )
}